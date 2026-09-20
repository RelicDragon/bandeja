/**
 * PRD 351 — Referrals admin page.
 *
 * Sits next to the link-to-app campaign tables and reads like one: a referrer
 * is a row, with invited / joined / played / rewarded counts. Date filters
 * apply to when the invite happened, not when it paid out, so a January invite
 * that pays in March still belongs to January.
 */

/**
 * Generic CSV download. `Admin/ads-api.js#adsDownloadExport` does the same
 * thing but is hard-wired to `/admin/ads`; this is that helper with the path
 * prefix lifted out, so the next page that needs an export can reuse it
 * instead of adding a third copy.
 */
async function adminDownloadExport(path, fallbackFilename, isRetry = false) {
    const response = await fetch(`${API_URL}${path}`, {
        headers: {
            ...(typeof adminClientHeaders === 'function' ? adminClientHeaders() : {}),
            ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        credentials: 'include',
    });
    if (response.status === 401 && !isRetry && typeof refreshAdminAccess === 'function') {
        const refreshed = await refreshAdminAccess();
        if (refreshed) return adminDownloadExport(path, fallbackFilename, true);
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

function referralFilterParams() {
    const params = new URLSearchParams();
    const startDate = document.getElementById('referralStartDate')?.value;
    const endDate = document.getElementById('referralEndDate')?.value;
    const search = document.getElementById('referralSearch')?.value.trim();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    return params;
}

function renderReferralTotals(totals) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value ?? 0);
    };
    set('referralTotalInvited', totals?.invited);
    set('referralTotalJoined', totals?.joined);
    set('referralTotalPlayed', totals?.played);
    set('referralTotalRewarded', totals?.rewarded);
    set('referralTotalRevoked', totals?.revoked);
    set('referralTotalCoins', totals?.coinsPaid);
}

function renderReferralRows(rows) {
    const body = document.getElementById('referralRowsBody');
    if (!body) return;
    if (!rows.length) {
        body.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:2rem">No referrals in this range.</td></tr>';
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
                <td>${escapeHtml(row.referrerName)}</td>
                <td><code>${escapeHtml(row.referralCode || '—')}</code></td>
                <td>${row.invited}</td>
                <td>${row.joined}</td>
                <td>${row.played}</td>
                <td>${row.rewarded}</td>
                <td>${row.coinsPaid}</td>
                <td>${row.lastJoinedAt ? escapeHtml(formatDate(row.lastJoinedAt)) : '—'}</td>
            </tr>`
        )
        .join('');
}

function renderReferralRewards(rewards) {
    const body = document.getElementById('referralRewardsBody');
    if (!body) return;
    if (!rewards.length) {
        body.innerHTML =
            '<tr><td colspan="6" style="text-align:center;padding:2rem">No payouts in this range.</td></tr>';
        return;
    }
    body.innerHTML = rewards
        .map(
            (row) => `<tr>
                <td>${escapeHtml(formatDate(row.rewardedAt))}</td>
                <td>${escapeHtml(row.referrerName)}</td>
                <td>${escapeHtml(row.referredName)}</td>
                <td>${row.referrerCoins ?? '—'} / ${row.referredCoins ?? '—'}</td>
                <td>${
                    row.revokedAt
                        ? `<span class="badge badge-danger">Revoked ${escapeHtml(formatDate(row.revokedAt))}</span>`
                        : '<span class="badge badge-success">Active</span>'
                }</td>
                <td>
                    ${
                        row.revokedAt
                            ? ''
                            : `<button class="btn-small btn-delete" onclick='revokeReferralReward(${JSON.stringify(
                                  row.id
                              )}, ${JSON.stringify(row.referredName)})'>Revoke</button>`
                    }
                </td>
            </tr>`
        )
        .join('');
}

async function loadReferralsPage() {
    const rowsBody = document.getElementById('referralRowsBody');
    const rewardsBody = document.getElementById('referralRewardsBody');
    if (!rowsBody || !rewardsBody) return;
    rowsBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem">Loading…</td></tr>';
    try {
        const qs = referralFilterParams().toString();
        const response = await apiRequest(`/admin/referrals${qs ? `?${qs}` : ''}`);
        const data = response.data || {};
        renderReferralTotals(data.totals);
        renderReferralRows(data.rows || []);
        renderReferralRewards(data.recentRewards || []);
    } catch (error) {
        rowsBody.innerHTML = `<tr><td colspan="8" class="error">${escapeHtml(
            error.message || 'Failed to load'
        )}</td></tr>`;
        rewardsBody.innerHTML = '';
    }
}

async function exportReferralsCsv() {
    try {
        const qs = referralFilterParams().toString();
        await adminDownloadExport(`/admin/referrals/export${qs ? `?${qs}` : ''}`, 'referrals.csv');
    } catch (error) {
        toast(error.message || 'Export failed', 'error');
    }
}

async function revokeReferralReward(rewardId, referredName) {
    if (!confirm(`Revoke the referral reward for ${referredName}? Coins already granted are not clawed back.`)) {
        return;
    }
    try {
        await apiRequest(`/admin/referrals/rewards/${rewardId}/revoke`, { method: 'POST' });
        toast('Referral reward revoked', 'success');
        await loadReferralsPage();
    } catch (error) {
        toast(error.message || 'Revoke failed', 'error');
    }
}

function resetReferralFilters() {
    const ids = ['referralStartDate', 'referralEndDate', 'referralSearch'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadReferralsPage();
}

window.loadReferralsPage = loadReferralsPage;
window.exportReferralsCsv = exportReferralsCsv;
window.revokeReferralReward = revokeReferralReward;
window.resetReferralFilters = resetReferralFilters;
