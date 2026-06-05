let adsSponsorsCache = [];

async function loadAdsSponsorsTab() {
    const tbody = document.getElementById('adsSponsorsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    try {
        adsSponsorsCache = await fetchAdSponsors();
        renderAdsSponsorsTable(adsSponsorsCache);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(error.message || 'Failed to load sponsors')}</td></tr>`;
    }
}

function renderAdsSponsorsTable(sponsors) {
    const tbody = document.getElementById('adsSponsorsTableBody');
    if (!sponsors.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">No sponsors yet.</td></tr>';
        return;
    }
    tbody.innerHTML = sponsors.map((s) => `
        <tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.contactEmail || '—')}</td>
            <td>${escapeHtml(s.clubId || '—')}</td>
            <td>${s.campaignCount ?? '—'}</td>
            <td>${formatDate(s.createdAt)}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="btn-small btn-edit" onclick="openAdSponsorModal('${s.id}')">Edit</button>
                    <button type="button" class="btn-small btn-delete" onclick="deleteAdSponsorRow('${s.id}', ${JSON.stringify(s.name)})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAdSponsorModal(id) {
    const form = document.getElementById('adSponsorForm');
    form.reset();
    if (id) {
        const sponsor = adsSponsorsCache.find((s) => s.id === id);
        if (!sponsor) return;
        document.getElementById('adSponsorModalTitle').textContent = 'Edit Sponsor';
        form.dataset.mode = 'edit';
        form.dataset.sponsorId = id;
        document.getElementById('adSponsorName').value = sponsor.name;
        document.getElementById('adSponsorEmail').value = sponsor.contactEmail || '';
        document.getElementById('adSponsorNotes').value = sponsor.notes || '';
        document.getElementById('adSponsorClubId').value = sponsor.clubId || '';
    } else {
        document.getElementById('adSponsorModalTitle').textContent = 'Add Sponsor';
        form.dataset.mode = 'create';
        form.dataset.sponsorId = '';
    }
    openModal('adSponsorModal');
}

async function handleAdSponsorSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
        name: document.getElementById('adSponsorName').value.trim(),
        contactEmail: optionalTrimToNull(document.getElementById('adSponsorEmail').value),
        notes: optionalTrimToNull(document.getElementById('adSponsorNotes').value),
        clubId: optionalTrimToNull(document.getElementById('adSponsorClubId').value),
    };
    try {
        if (form.dataset.mode === 'edit') {
            await updateAdSponsor(form.dataset.sponsorId, payload);
            toast('Sponsor updated', 'success');
        } else {
            await createAdSponsor(payload);
            toast('Sponsor created', 'success');
        }
        closeModal('adSponsorModal');
        loadAdsSponsorsTab();
        if (typeof refreshAdsCampaignSponsorSelect === 'function') refreshAdsCampaignSponsorSelect();
    } catch (error) {
        toast(error.message || 'Save failed', 'error');
    }
}

async function deleteAdSponsorRow(id, name) {
    if (!confirm(`Delete sponsor "${name}"?`)) return;
    try {
        await deleteAdSponsor(id);
        toast('Sponsor deleted', 'success');
        loadAdsSponsorsTab();
        if (typeof refreshAdsCampaignSponsorSelect === 'function') refreshAdsCampaignSponsorSelect();
    } catch (error) {
        toast(error.message || 'Delete failed', 'error');
    }
}

window.openAdSponsorModal = openAdSponsorModal;
window.handleAdSponsorSubmit = handleAdSponsorSubmit;
window.deleteAdSponsorRow = deleteAdSponsorRow;
