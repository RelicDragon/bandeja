const LTA_QR_BASE = 'https://bandeja.me/link-to-app?utm_source=qr&utm_medium=offline&utm_campaign=';

function ltaQrUrl(campaign) {
  if (!campaign) return '';
  return LTA_QR_BASE + encodeURIComponent(campaign);
}

function ltaCampaignCell(displayName, campaign) {
  const shown = displayName || campaign || '—';
  if (campaign && displayName && displayName !== campaign) {
    return `${escapeHtml(displayName)}<div class="text-muted" style="font-size:0.75rem">${escapeHtml(campaign)}</div>`;
  }
  return escapeHtml(shown);
}

function fillLinkToAppCampaignUuid() {
  const input = document.getElementById('ltaCampaignCode');
  if (!input || !crypto.randomUUID) return;
  input.value = crypto.randomUUID();
  updateLinkToAppCampaignUrl();
}

function updateLinkToAppCampaignUrl() {
  const code = document.getElementById('ltaCampaignCode')?.value.trim();
  const el = document.getElementById('ltaCampaignUrl');
  if (!el) return;
  el.textContent = code ? ltaQrUrl(code) : '';
}

function renderLinkToAppLabels(labels) {
  const body = document.getElementById('linkToAppLabelBody');
  if (!body) return;
  if (!labels.length) {
    body.innerHTML =
      '<tr><td colspan="4" style="text-align:center;padding:2rem">No names yet. Save a code + visual name (before or after the first scan).</td></tr>';
    return;
  }
  body.innerHTML = labels
    .map((row) => {
      const url = ltaQrUrl(row.utmCampaign);
      return `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td><code>${escapeHtml(row.utmCampaign)}</code></td>
        <td><code>${escapeHtml(url)}</code></td>
        <td>
          <div class="action-buttons">
            <button class="btn-small btn-edit" onclick='editLinkToAppCampaignLabel(${JSON.stringify(row.utmCampaign)}, ${JSON.stringify(row.label)})'>Edit</button>
            <button class="btn-small btn-delete" onclick='deleteLinkToAppCampaignLabel(${JSON.stringify(row.utmCampaign)})'>Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function editLinkToAppCampaignLabel(utmCampaign, label) {
  const codeEl = document.getElementById('ltaCampaignCode');
  const labelEl = document.getElementById('ltaCampaignLabel');
  if (codeEl) codeEl.value = utmCampaign;
  if (labelEl) labelEl.value = label;
  updateLinkToAppCampaignUrl();
  codeEl?.focus();
}

async function saveLinkToAppCampaignLabel(event) {
  event.preventDefault();
  const utmCampaign = document.getElementById('ltaCampaignCode')?.value.trim();
  const label = document.getElementById('ltaCampaignLabel')?.value.trim();
  try {
    await apiRequest('/admin/link-to-app/campaign-labels', {
      method: 'PUT',
      body: JSON.stringify({ utmCampaign, label }),
    });
    await loadLinkToAppStats();
  } catch (error) {
    alert(error.message || 'Failed to save mapping');
  }
  return false;
}

async function deleteLinkToAppCampaignLabel(utmCampaign) {
  if (!utmCampaign) return;
  if (!confirm(`Remove visual name for ${utmCampaign}? Scans stay; Admin will show the code again.`)) return;
  try {
    await apiRequest(`/admin/link-to-app/campaign-labels/${encodeURIComponent(utmCampaign)}`, {
      method: 'DELETE',
    });
    await loadLinkToAppStats();
  } catch (error) {
    alert(error.message || 'Failed to delete mapping');
  }
}

async function loadLinkToAppStats() {
  const days = document.getElementById('linkToAppDays')?.value || '30';
  const campaignBody = document.getElementById('linkToAppCampaignBody');
  const recentBody = document.getElementById('linkToAppRecentBody');
  const usersBody = document.getElementById('linkToAppUsersBody');
  if (!campaignBody || !recentBody) return;
  try {
    const response = await apiRequest(`/admin/link-to-app/stats?days=${encodeURIComponent(days)}`);
    const data = response.data || {};
    const totals = data.totals || {};
    document.getElementById('ltaView').textContent = totals.view ?? 0;
    document.getElementById('ltaIos').textContent = totals.ios ?? 0;
    document.getElementById('ltaAndroid').textContent = totals.android ?? 0;
    document.getElementById('ltaWeb').textContent = totals.web ?? 0;
    const regEl = document.getElementById('ltaRegister');
    const loginEl = document.getElementById('ltaLogin');
    if (regEl) regEl.textContent = totals.register ?? 0;
    if (loginEl) loginEl.textContent = totals.login ?? 0;

    renderLinkToAppLabels(data.labels || []);
    updateLinkToAppCampaignUrl();

    const campaigns = data.byCampaign || [];
    if (!campaigns.length) {
      campaignBody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;padding:2rem">No scans yet. Use utm_campaign on the QR URL.</td></tr>';
    } else {
      campaignBody.innerHTML = campaigns
        .map(
          (row) => `<tr>
            <td>${ltaCampaignCell(row.displayName, row.campaign)}</td>
            <td>${escapeHtml(row.source || '—')}</td>
            <td>${escapeHtml(row.medium || '—')}</td>
            <td>${row.view ?? 0}</td>
            <td>${row.ios ?? 0}</td>
            <td>${row.android ?? 0}</td>
            <td>${row.web ?? 0}</td>
            <td>${row.register ?? 0}</td>
            <td>${row.login ?? 0}</td>
          </tr>`
        )
        .join('');
    }

    if (usersBody) {
      const converted = data.convertedUsers || [];
      if (!converted.length) {
        usersBody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;padding:2rem">No attributed sign-ins yet.</td></tr>';
      } else {
        usersBody.innerHTML = converted
          .map((row) => {
            const name = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.phone || row.id;
            return `<tr>
              <td>${escapeHtml(formatDate(row.attributedAt || row.createdAt))}</td>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(row.attributionAuthKind || '—')}</td>
              <td>${ltaCampaignCell(row.utmCampaignDisplay, row.utmCampaign)}</td>
              <td>${escapeHtml(row.attributionChoice || '—')}</td>
            </tr>`;
          })
          .join('');
      }
    }

    const recent = data.recent || [];
    if (!recent.length) {
      recentBody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:2rem">No events yet.</td></tr>';
    } else {
      recentBody.innerHTML = recent
        .map(
          (row) => `<tr>
            <td>${escapeHtml(formatDate(row.createdAt))}</td>
            <td>${escapeHtml(row.kind)}</td>
            <td>${ltaCampaignCell(row.utmCampaignDisplay, row.utmCampaign)}</td>
            <td>${escapeHtml(row.utmSource || '—')}</td>
            <td>${escapeHtml(row.platform || '—')}</td>
          </tr>`
        )
        .join('');
    }
  } catch (error) {
    campaignBody.innerHTML = `<tr><td colspan="9" class="error">${escapeHtml(error.message || 'Failed to load')}</td></tr>`;
    recentBody.innerHTML = '';
    if (usersBody) usersBody.innerHTML = '';
    const labelBody = document.getElementById('linkToAppLabelBody');
    if (labelBody) labelBody.innerHTML = '';
  }
}

document.getElementById('ltaCampaignCode')?.addEventListener('input', updateLinkToAppCampaignUrl);
