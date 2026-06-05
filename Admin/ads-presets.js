let adsSegmentPresetsCache = [];

async function loadAdsSegmentPresets() {
    adsSegmentPresetsCache = await fetchAdSegmentPresets();
    return adsSegmentPresetsCache;
}

function renderAdsPresetPicker(selectedId) {
    const select = document.getElementById('adCampaignPresetPicker');
    if (!select) return;
    select.innerHTML = '<option value="">— Select preset —</option>' +
        adsSegmentPresetsCache.map((p) =>
            `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)}${p.builtin ? ' (built-in)' : ''}</option>`
        ).join('');
}

async function refreshAdsPresetPicker() {
    await loadAdsSegmentPresets();
    renderAdsPresetPicker();
}

async function applyAdsSegmentPreset() {
    const presetId = document.getElementById('adCampaignPresetPicker')?.value;
    if (!presetId) {
        toast('Select a preset first', 'error');
        return;
    }
    if (!adsSegmentPresetsCache.length) await loadAdsSegmentPresets();
    const preset = adsSegmentPresetsCache.find((p) => p.id === presetId);
    if (!preset) return;
    await ensureAdsEditorCities();
    const targeting = mergePresetTargeting(preset, adsCitiesCache);
    if (!targeting.cityIds.length) {
        if (preset.cityNames?.length) {
            toast(`Could not resolve cities: ${preset.cityNames.join(', ')}`, 'error');
            return;
        }
        toast('No cities available — load cities first', 'error');
        return;
    }
    applyAdsTargetingToForm(targeting);
    toast(`Applied preset: ${preset.name}`, 'success');
}

async function openAdsPresetsModal() {
    if (!adsSegmentPresetsCache.length) await loadAdsSegmentPresets();
    renderAdsPresetsList();
    openModal('adSegmentPresetsModal');
}

function renderAdsPresetsList() {
    const container = document.getElementById('adsPresetsList');
    if (!container) return;
    if (!adsSegmentPresetsCache.length) {
        container.innerHTML = '<p class="text-muted">No presets.</p>';
        return;
    }
    container.innerHTML = adsSegmentPresetsCache.map((p) => `
        <div class="ads-preset-item ${p.builtin ? 'ads-preset-builtin' : ''}">
            <div class="ads-preset-item-head">
                <strong>${escapeHtml(p.name)}</strong>
                ${p.builtin ? '<span class="badge badge-secondary">built-in</span>' : ''}
            </div>
            ${p.description ? `<p class="text-muted">${escapeHtml(p.description)}</p>` : ''}
            <pre class="ads-preset-json">${escapeHtml(JSON.stringify(p.targeting, null, 2))}</pre>
            <div class="ads-preset-item-actions">
                ${p.builtin ? '' : `<button type="button" class="btn-small btn-delete" onclick="deleteAdsPresetRow('${p.id}', ${JSON.stringify(p.name)})">Delete</button>`}
            </div>
        </div>
    `).join('');
}

function resetAdsPresetForm() {
    const form = document.getElementById('adPresetForm');
    if (!form) return;
    form.reset();
    form.dataset.mode = 'create';
    form.dataset.presetId = '';
    document.getElementById('adPresetModalTitle').textContent = 'Save current targeting as preset';
    document.getElementById('adPresetTargetingJson').value = JSON.stringify(collectAdsExtendedTargeting(), null, 2);
}

function openAdsPresetSaveModal() {
    resetAdsPresetForm();
    openModal('adPresetSaveModal');
}

async function handleAdPresetSaveSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const name = document.getElementById('adPresetName').value.trim();
    const description = optionalTrimToNull(document.getElementById('adPresetDescription').value);
    let targeting;
    try {
        targeting = JSON.parse(document.getElementById('adPresetTargetingJson').value);
    } catch {
        toast('Invalid targeting JSON', 'error');
        return;
    }
    if (!name) {
        toast('Preset name is required', 'error');
        return;
    }
    try {
        await createAdSegmentPreset({ name, description, targeting });
        toast('Preset saved', 'success');
        closeModal('adPresetSaveModal');
        await refreshAdsPresetPicker();
        renderAdsPresetsList();
    } catch (error) {
        toast(error.message || 'Save failed — API may not be ready yet', 'error');
    }
}

async function deleteAdsPresetRow(id, name) {
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
        await deleteAdSegmentPreset(id);
        toast('Preset deleted', 'success');
        await refreshAdsPresetPicker();
        renderAdsPresetsList();
    } catch (error) {
        toast(error.message || 'Delete failed', 'error');
    }
}

window.applyAdsSegmentPreset = applyAdsSegmentPreset;
window.openAdsPresetsModal = openAdsPresetsModal;
window.openAdsPresetSaveModal = openAdsPresetSaveModal;
window.handleAdPresetSaveSubmit = handleAdPresetSaveSubmit;
window.deleteAdsPresetRow = deleteAdsPresetRow;
window.refreshAdsPresetPicker = refreshAdsPresetPicker;
