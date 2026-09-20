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
    setCoinsPerCurrencyUnitStatus('');
    setReferralRewardsStatus('');
    await loadReplicatePhotoModelSetting();
    await loadCoinsPerCurrencyUnitSetting();
    await loadReferralRewardSettings();
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

/**
 * `GET /admin/platform-settings` answers `{ settings, knownKeys }`, not a bare
 * array (`Backend/src/controllers/admin.controller.ts#getPlatformSettings`).
 * Treating `response.data` as the list threw a TypeError that surfaced to the
 * operator as "Failed to load". The array branch tolerates the older shape.
 */
function platformSettingRows(response) {
    const data = response && response.data;
    if (Array.isArray(data)) return data;
    return data && Array.isArray(data.settings) ? data.settings : [];
}

function formatPlatformSettingsApiError(error) {
    const msg = error?.message || 'Request failed';
    if (msg.includes('Cannot reach API at')) {
        return `${msg} Start ./Admin/serve.sh (or --dev) and use API URL /api.`;
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

// --- PRD 348: cost split -------------------------------------------------
// `COINS_PER_CURRENCY_UNIT` is deliberately unset by default. While no row
// exists the app hides the "settle with coins" option everywhere, so clearing
// this field is a real operation, not a no-op.
const COINS_PER_CURRENCY_UNIT_KEY = 'COINS_PER_CURRENCY_UNIT';
let coinsPerCurrencyUnitActive = '';

function setCoinsPerCurrencyUnitStatus(message, type) {
    const el = document.getElementById('coinsPerCurrencyUnitStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'platform-settings-status' + (type ? ` ${type}` : '');
}

function updateCoinsPerCurrencyUnitSaveButton() {
    const btn = document.getElementById('coinsPerCurrencyUnitSaveBtn');
    const input = document.getElementById('coinsPerCurrencyUnitInput');
    if (!btn || !input) return;
    btn.disabled = input.disabled || input.value.trim() === coinsPerCurrencyUnitActive;
}

async function loadCoinsPerCurrencyUnitSetting() {
    const input = document.getElementById('coinsPerCurrencyUnitInput');
    const activeEl = document.getElementById('coinsPerCurrencyUnitActive');
    if (!input || !activeEl) return;

    input.disabled = true;
    setCoinsPerCurrencyUnitStatus('Loading…', 'loading');

    try {
        const response = await apiRequest('/admin/platform-settings');
        if (!response.success) throw new Error('Failed to load settings');

        const row = platformSettingRows(response).find(
            (entry) => entry.key === COINS_PER_CURRENCY_UNIT_KEY
        );
        coinsPerCurrencyUnitActive = row ? String(row.value).trim() : '';
        activeEl.textContent = coinsPerCurrencyUnitActive || 'unset — coins option hidden';
        input.value = coinsPerCurrencyUnitActive;
        input.disabled = false;
        setCoinsPerCurrencyUnitStatus('');
        updateCoinsPerCurrencyUnitSaveButton();
    } catch (error) {
        console.error('Failed to load COINS_PER_CURRENCY_UNIT:', error);
        input.disabled = false;
        setCoinsPerCurrencyUnitStatus(formatPlatformSettingsApiError(error) || 'Failed to load', 'error');
    }
}

async function saveCoinsPerCurrencyUnit() {
    const input = document.getElementById('coinsPerCurrencyUnitInput');
    const activeEl = document.getElementById('coinsPerCurrencyUnitActive');
    if (!input || !activeEl) return;

    const value = input.value.trim();
    if (value !== '' && !(Number(value) > 0)) {
        setCoinsPerCurrencyUnitStatus('Enter a positive number, or clear the field to disable coins.', 'error');
        return;
    }

    input.disabled = true;
    setCoinsPerCurrencyUnitStatus('Saving…', 'loading');

    try {
        await apiRequest(`/admin/platform-settings/${COINS_PER_CURRENCY_UNIT_KEY}`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
        coinsPerCurrencyUnitActive = value;
        activeEl.textContent = value || 'unset — coins option hidden';
        setCoinsPerCurrencyUnitStatus('Saved', 'success');
        toast('Cost split coin rate updated', 'success');
    } catch (error) {
        console.error('Failed to save COINS_PER_CURRENCY_UNIT:', error);
        const msg = formatPlatformSettingsApiError(error) || 'Failed to save';
        setCoinsPerCurrencyUnitStatus(msg, 'error');
        toast(msg, 'error');
    } finally {
        input.disabled = false;
        updateCoinsPerCurrencyUnitSaveButton();
    }
}

// --- PRD 351: referral rewards -------------------------------------------
// `REFERRAL_REWARD_REFERRER` / `REFERRAL_REWARD_REFERRED` are admin-tunable
// (`Backend/src/services/platformSetting.service.ts`). With no row the backend
// falls back to `REFERRAL_DEFAULT_*`, so clearing a field is a real operation.
const REFERRAL_REWARD_FIELDS = [
    { key: 'REFERRAL_REWARD_REFERRER', inputId: 'referralRewardReferrerInput', activeId: 'referralRewardReferrerActive' },
    { key: 'REFERRAL_REWARD_REFERRED', inputId: 'referralRewardReferredInput', activeId: 'referralRewardReferredActive' },
];
const referralRewardActive = {};

function setReferralRewardsStatus(message, type) {
    const el = document.getElementById('referralRewardsStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'platform-settings-status' + (type ? ` ${type}` : '');
}

function updateReferralRewardsSaveButton() {
    const btn = document.getElementById('referralRewardsSaveBtn');
    if (!btn) return;
    let disabled = false;
    let dirty = false;
    for (const field of REFERRAL_REWARD_FIELDS) {
        const input = document.getElementById(field.inputId);
        if (!input) continue;
        if (input.disabled) disabled = true;
        if (input.value.trim() !== (referralRewardActive[field.key] || '')) dirty = true;
    }
    btn.disabled = disabled || !dirty;
}

async function loadReferralRewardSettings() {
    const inputs = REFERRAL_REWARD_FIELDS.map((field) => document.getElementById(field.inputId));
    if (inputs.some((input) => !input)) return;

    inputs.forEach((input) => { input.disabled = true; });
    setReferralRewardsStatus('Loading…', 'loading');

    try {
        const response = await apiRequest('/admin/platform-settings');
        if (!response.success) throw new Error('Failed to load settings');

        const rows = platformSettingRows(response);
        for (const field of REFERRAL_REWARD_FIELDS) {
            const row = rows.find((entry) => entry.key === field.key);
            const value = row ? String(row.value).trim() : '';
            referralRewardActive[field.key] = value;
            const activeEl = document.getElementById(field.activeId);
            if (activeEl) activeEl.textContent = value || 'unset — built-in default';
            const input = document.getElementById(field.inputId);
            if (input) input.value = value;
        }
        setReferralRewardsStatus('');
    } catch (error) {
        console.error('Failed to load referral reward settings:', error);
        setReferralRewardsStatus(formatPlatformSettingsApiError(error) || 'Failed to load', 'error');
    } finally {
        inputs.forEach((input) => { input.disabled = false; });
        updateReferralRewardsSaveButton();
    }
}

async function saveReferralRewards() {
    const inputs = REFERRAL_REWARD_FIELDS.map((field) => document.getElementById(field.inputId));
    if (inputs.some((input) => !input)) return;

    const pending = [];
    for (const field of REFERRAL_REWARD_FIELDS) {
        const value = document.getElementById(field.inputId).value.trim();
        if (value !== '' && !(Number.isInteger(Number(value)) && Number(value) >= 0)) {
            setReferralRewardsStatus('Enter a whole number of coins, or clear the field for the default.', 'error');
            return;
        }
        if (value !== (referralRewardActive[field.key] || '')) pending.push({ field, value });
    }
    if (pending.length === 0) return;

    inputs.forEach((input) => { input.disabled = true; });
    setReferralRewardsStatus('Saving…', 'loading');

    try {
        for (const { field, value } of pending) {
            await apiRequest(`/admin/platform-settings/${field.key}`, {
                method: 'PUT',
                body: JSON.stringify({ value }),
            });
            referralRewardActive[field.key] = value;
            const activeEl = document.getElementById(field.activeId);
            if (activeEl) activeEl.textContent = value || 'unset — built-in default';
        }
        setReferralRewardsStatus('Saved', 'success');
        toast('Referral rewards updated', 'success');
    } catch (error) {
        console.error('Failed to save referral reward settings:', error);
        const msg = formatPlatformSettingsApiError(error) || 'Failed to save';
        setReferralRewardsStatus(msg, 'error');
        toast(msg, 'error');
    } finally {
        inputs.forEach((input) => { input.disabled = false; });
        updateReferralRewardsSaveButton();
    }
}

window.loadPlatformSettingsPage = loadPlatformSettingsPage;
window.saveReplicatePhotoModel = saveReplicatePhotoModel;
window.updateReplicateModelSaveButton = updateReplicateModelSaveButton;
window.saveCoinsPerCurrencyUnit = saveCoinsPerCurrencyUnit;
window.updateCoinsPerCurrencyUnitSaveButton = updateCoinsPerCurrencyUnitSaveButton;
window.saveReferralRewards = saveReferralRewards;
window.updateReferralRewardsSaveButton = updateReferralRewardsSaveButton;