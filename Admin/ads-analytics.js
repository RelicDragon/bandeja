let adsAnalyticsCities = [];

async function loadAdsAnalyticsTab() {
    await ensureAdsAnalyticsFilters();
    await refreshAdsAnalyticsEntitySelect();
}

async function ensureAdsAnalyticsFilters() {
    if (!adsAnalyticsCities.length) {
        try {
            const res = await apiRequest('/admin/cities');
            adsAnalyticsCities = res.success ? res.data : [];
        } catch {
            adsAnalyticsCities = [];
        }
    }
    const citySelect = document.getElementById('adsAnalyticsCity');
    if (citySelect && !citySelect.options.length) {
        citySelect.innerHTML = '<option value="">All cities</option>' +
            adsAnalyticsCities.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
}

async function refreshAdsAnalyticsEntitySelect() {
    const view = document.getElementById('adsAnalyticsView').value;
    const select = document.getElementById('adsAnalyticsEntityId');
    select.innerHTML = '<option value="">Select…</option>';
    try {
        if (view === 'sponsor') {
            const sponsors = await fetchAdSponsors();
            select.innerHTML += sponsors.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        } else {
            const campaigns = await fetchAdCampaigns();
            select.innerHTML += campaigns.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        }
    } catch (error) {
        toast(error.message || 'Failed to load entities', 'error');
    }
}

function collectAdsAnalyticsFilters() {
    const params = {};
    const placement = document.getElementById('adsAnalyticsPlacement').value;
    const cityId = document.getElementById('adsAnalyticsCity').value;
    const locale = document.getElementById('adsAnalyticsLocale').value;
    const startDate = document.getElementById('adsAnalyticsStartDate').value;
    const endDate = document.getElementById('adsAnalyticsEndDate').value;
    if (placement) params.placement = placement;
    if (cityId) params.cityId = cityId;
    if (locale) params.locale = locale;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return params;
}

function normalizeAdStatsResponse(data) {
    const summary = data.summary || data.totals || data;
    if (data.breakdown?.length) {
        return { summary, breakdown: data.breakdown };
    }
    if (data.rows?.length) {
        return { summary, breakdown: data.rows };
    }
    if (data.rollups?.length) {
        return {
            summary,
            breakdown: data.rollups.map((row) => ({
                date: row.date,
                placement: row.placement,
                cityId: row.cityId,
                locale: row.locale,
                impressions: row.impressions,
                uniqueUsers: row.uniqueUsers,
                clicks: row.clicks,
                dismisses: row.dismisses,
            })),
        };
    }
    if (data.rawBreakdown?.length) {
        return { summary, breakdown: data.rawBreakdown };
    }
    return { summary, breakdown: [] };
}

function renderAdsStatsSummary(summary) {
    const ctr = summary.impressions > 0 ? ((summary.clicks / summary.impressions) * 100).toFixed(2) : '0.00';
    const dismissRate = summary.impressions > 0 ? ((summary.dismisses / summary.impressions) * 100).toFixed(2) : '0.00';
    document.getElementById('adsStatImpressions').textContent = summary.impressions ?? 0;
    document.getElementById('adsStatUniqueUsers').textContent = summary.uniqueUsers ?? 0;
    document.getElementById('adsStatClicks').textContent = summary.clicks ?? 0;
    document.getElementById('adsStatDismisses').textContent = summary.dismisses ?? 0;
    document.getElementById('adsStatCtr').textContent = `${ctr}%`;
    document.getElementById('adsStatDismissRate').textContent = `${dismissRate}%`;
}

function renderAdsStatsBreakdown(rows) {
    const tbody = document.getElementById('adsAnalyticsBreakdownBody');
    if (!rows?.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No data for selected filters.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((row) => {
        const ctr = row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00';
        const cityName = row.cityId
            ? adsAnalyticsCities.find((c) => c.id === row.cityId)?.name || row.cityId
            : '—';
        return `<tr>
            <td>${row.date ? escapeHtml(row.date.slice(0, 10)) : '—'}</td>
            <td>${row.placement ? escapeHtml(adPlacementLabel(row.placement)) : '—'}</td>
            <td>${escapeHtml(cityName)}</td>
            <td>${escapeHtml(row.locale || '—')}</td>
            <td>${row.impressions ?? 0}</td>
            <td>${row.uniqueUsers ?? 0}</td>
            <td>${row.clicks ?? 0} (${ctr}%)</td>
        </tr>`;
    }).join('');
}

async function loadAdsAnalyticsStats() {
    const view = document.getElementById('adsAnalyticsView').value;
    const entityId = document.getElementById('adsAnalyticsEntityId').value;
    const params = collectAdsAnalyticsFilters();
    const summaryEl = document.getElementById('adsAnalyticsSummary');
    summaryEl.textContent = 'Loading…';

    try {
        let data;
        if (entityId) {
            data = view === 'sponsor'
                ? await fetchAdSponsorStats(entityId, params)
                : await fetchAdCampaignStats(entityId, params);
        } else {
            params.view = view;
            data = await fetchAdAnalyticsOverview(params);
        }
        const { summary, breakdown } = normalizeAdStatsResponse(data);
        renderAdsStatsSummary(summary);
        renderAdsStatsBreakdown(breakdown);
        summaryEl.textContent = '';
    } catch (error) {
        summaryEl.textContent = '';
        renderAdsStatsSummary({ impressions: 0, uniqueUsers: 0, clicks: 0, dismisses: 0 });
        renderAdsStatsBreakdown([]);
        toast(error.message || 'Failed to load stats', 'error');
    }
}

async function exportAdsAnalytics(format) {
    const view = document.getElementById('adsAnalyticsView').value;
    const entityId = document.getElementById('adsAnalyticsEntityId').value;
    if (!entityId) {
        toast('Select a campaign or sponsor to export', 'error');
        return;
    }
    if (format === 'pdf' && view !== 'sponsor') {
        toast('PDF export is available for sponsors only', 'error');
        return;
    }
    const params = collectAdsAnalyticsFilters();
    try {
        if (view === 'sponsor') {
            await exportAdSponsor(entityId, format, params);
        } else {
            await exportAdCampaign(entityId, format, params);
        }
        toast(`${format.toUpperCase()} export started`, 'success');
    } catch (error) {
        toast(error.message || 'Export failed', 'error');
    }
}

function handleAdsAnalyticsViewChange() {
    refreshAdsAnalyticsEntitySelect();
}

window.loadAdsAnalyticsStats = loadAdsAnalyticsStats;
window.exportAdsAnalytics = exportAdsAnalytics;
window.handleAdsAnalyticsViewChange = handleAdsAnalyticsViewChange;
