const REPLICATE_MODEL_LABELS = {
    'black-forest-labs/flux-2-max': 'Flux 2 Max',
    'black-forest-labs/flux-2-pro': 'Flux 2 Pro',
    'google/nano-banana-2': 'Nano Banana 2',
    'openai/gpt-image-2': 'GPT Image 2',
};

let replicatePhotoModelState = {
    activeModelId: null,
    envFallbackModelId: null,
};

function formatReplicateModelLabel(modelId) {
    if (!modelId) return '—';
    const label = REPLICATE_MODEL_LABELS[modelId];
    return label ? `${label} (${modelId})` : modelId;
}

function setReplicateModelStatus(message, type) {
    const el = document.getElementById('replicateModelStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'platform-settings-status' + (type ? ` ${type}` : '');
}

function updateReplicateModelSaveButton() {
    const btn = document.getElementById('replicateModelSaveBtn');
    const select = document.getElementById('replicateModelSelect');
    if (!btn || !select) return;
    const dirty = select.value && select.value !== replicatePhotoModelState.activeModelId;
    btn.disabled = !dirty || select.disabled;
}

async function loadPlatformSettingsPage() {
    setReplicateModelStatus('');
    await loadReplicatePhotoModelSetting();
}

async function loadReplicatePhotoModelSetting() {
    const select = document.getElementById('replicateModelSelect');
    const activeEl = document.getElementById('replicateModelActive');
    const fallbackEl = document.getElementById('replicateModelEnvFallback');
    const saveBtn = document.getElementById('replicateModelSaveBtn');
    if (!select || !activeEl || !fallbackEl) return;

    select.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
    setReplicateModelStatus('Loading…', 'loading');

    try {
        const response = await apiRequest('/admin/results-artifacts/photo-model');
        if (!response.success) throw new Error('Failed to load settings');

        const { activeModelId, models, envFallbackModelId } = response.data;
        replicatePhotoModelState = { activeModelId, envFallbackModelId };

        activeEl.textContent = formatReplicateModelLabel(activeModelId);
        fallbackEl.textContent = formatReplicateModelLabel(envFallbackModelId);

        select.innerHTML = (models || [])
            .map((id) => {
                const label = REPLICATE_MODEL_LABELS[id] || id;
                return `<option value="${escapeHtmlAttr(id)}">${escapeHtmlAttr(label)}</option>`;
            })
            .join('');
        select.value = activeModelId;
        select.disabled = false;
        setReplicateModelStatus('');
        updateReplicateModelSaveButton();
    } catch (error) {
        console.error('Failed to load replicate photo model setting:', error);
        select.innerHTML = '<option value="">Failed to load</option>';
        select.disabled = true;
        activeEl.textContent = '—';
        fallbackEl.textContent = '—';
        setReplicateModelStatus(formatPlatformSettingsApiError(error) || 'Failed to load', 'error');
    }
}

function formatPlatformSettingsApiError(error) {
    const msg = error?.message || 'Request failed';
    if (msg.includes('Cannot reach API at')) {
        return `${msg} For local dev use "Development (localhost:3000)" on the login screen.`;
    }
    return msg;
}

async function saveReplicatePhotoModel() {
    const select = document.getElementById('replicateModelSelect');
    const saveBtn = document.getElementById('replicateModelSaveBtn');
    if (!select || !saveBtn) return;

    const modelId = select.value;
    if (!modelId || modelId === replicatePhotoModelState.activeModelId) return;

    saveBtn.disabled = true;
    select.disabled = true;
    setReplicateModelStatus('Saving…', 'loading');

    try {
        const response = await apiRequest('/admin/results-artifacts/photo-model', {
            method: 'PATCH',
            body: JSON.stringify({ modelId }),
        });
        if (!response.success) throw new Error('Failed to save');

        const { activeModelId } = response.data;
        replicatePhotoModelState.activeModelId = activeModelId;

        const activeEl = document.getElementById('replicateModelActive');
        if (activeEl) activeEl.textContent = formatReplicateModelLabel(activeModelId);

        select.value = activeModelId;
        setReplicateModelStatus('Saved', 'success');
        toast('Replicate photo model updated', 'success');
    } catch (error) {
        console.error('Failed to save replicate photo model:', error);
        const msg = formatPlatformSettingsApiError(error) || 'Failed to save';
        setReplicateModelStatus(msg, 'error');
        toast(msg, 'error');
    } finally {
        select.disabled = false;
        updateReplicateModelSaveButton();
    }
}

window.loadPlatformSettingsPage = loadPlatformSettingsPage;
window.saveReplicatePhotoModel = saveReplicatePhotoModel;
window.updateReplicateModelSaveButton = updateReplicateModelSaveButton;