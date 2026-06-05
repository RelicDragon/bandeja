async function adsApiRequest(endpoint, options = {}, isRetry = false) {
    return apiRequest(`/admin/ads${endpoint}`, options, isRetry);
}

async function adsDownloadExport(path, fallbackFilename, isRetry = false) {
    const response = await fetch(`${API_URL}/admin/ads${path}`, {
        headers: {
            ...adminClientHeaders(),
            ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        credentials: 'include',
    });
    if (response.status === 401 && !isRetry) {
        const refreshed = await refreshAdminAccess();
        if (refreshed) return adsDownloadExport(path, fallbackFilename, true);
    }
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Export failed');
    }
    const blob = await response.blob();
    const cd = response.headers.get('content-disposition') || '';
    const match = cd.match(/filename="?([^";\n]+)"?/i);
    const filename = match ? match[1] : fallbackFilename;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function fetchAdSponsors() {
    const res = await adsApiRequest('/sponsors');
    return res.data || [];
}

async function createAdSponsor(payload) {
    const res = await adsApiRequest('/sponsors', { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
}

async function updateAdSponsor(id, payload) {
    const res = await adsApiRequest(`/sponsors/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    return res.data;
}

async function deleteAdSponsor(id) {
    await adsApiRequest(`/sponsors/${id}`, { method: 'DELETE' });
}

async function fetchAdSponsorStats(id, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await adsApiRequest(`/sponsors/${id}/stats${qs ? '?' + qs : ''}`);
    return res.data;
}

async function exportAdSponsor(id, format, params = {}) {
    const p = { ...params, format };
    const qs = new URLSearchParams(p).toString();
    await adsDownloadExport(`/sponsors/${id}/export?${qs}`, `sponsor-${id}.${format}`);
}

async function fetchAdCampaigns(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await adsApiRequest(`/campaigns${qs ? '?' + qs : ''}`);
    return res.data || [];
}

async function fetchAdCampaign(id) {
    const res = await adsApiRequest(`/campaigns/${id}`);
    return res.data;
}

async function createAdCampaign(payload) {
    const res = await adsApiRequest('/campaigns', { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
}

async function updateAdCampaign(id, payload) {
    const res = await adsApiRequest(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    return res.data;
}

async function deleteAdCampaign(id) {
    await adsApiRequest(`/campaigns/${id}`, { method: 'DELETE' });
}

async function fetchAdCampaignStats(id, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await adsApiRequest(`/campaigns/${id}/stats${qs ? '?' + qs : ''}`);
    return res.data;
}

async function exportAdCampaign(id, format, params = {}) {
    const p = { ...params, format };
    const qs = new URLSearchParams(p).toString();
    await adsDownloadExport(`/campaigns/${id}/export?${qs}`, `campaign-${id}.${format}`);
}

async function uploadAdCreative(campaignId, formData) {
    const res = await window.apiMultipartRequest(`/admin/ads/campaigns/${campaignId}/creatives/upload`, formData);
    return res.data;
}

async function fetchAdPreview(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await adsApiRequest(`/preview?${qs}`);
    return res.data;
}

async function fetchAdAnalyticsOverview(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await adsApiRequest(`/stats${qs ? '?' + qs : ''}`);
    return res.data;
}

async function fetchAdSegmentPresets() {
    try {
        const res = await adsApiRequest('/targeting-presets');
        const remote = res.data || [];
        const builtinNames = new Set(AD_BUILTIN_SEGMENT_PRESETS.map((p) => p.name.toLowerCase()));
        const custom = remote.filter((p) => !builtinNames.has(String(p.name).toLowerCase()));
        return [...AD_BUILTIN_SEGMENT_PRESETS, ...custom];
    } catch {
        return [...AD_BUILTIN_SEGMENT_PRESETS];
    }
}

async function createAdSegmentPreset(payload) {
    const res = await adsApiRequest('/targeting-presets', { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
}

async function deleteAdSegmentPreset(id) {
    await adsApiRequest(`/targeting-presets/${id}`, { method: 'DELETE' });
}

async function deleteAdCreative(campaignId, creativeId) {
    await adsApiRequest(`/campaigns/${campaignId}/creatives/${creativeId}`, { method: 'DELETE' });
}
