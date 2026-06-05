let adsCampaignsCache = [];
let adsCitiesCache = [];
let adsEditingCampaignId = null;
let adsEditorLocale = 'en';
let adsEditorVariant = 'A';
let adsCampaignCreativesCache = [];
let adsLevelBandsSelection = [];

async function loadAdsCampaignsTab() {
    const tbody = document.getElementById('adsCampaignsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
    try {
        adsCampaignsCache = await fetchAdCampaigns();
        renderAdsCampaignsTable(adsCampaignsCache);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="error">${escapeHtml(error.message || 'Failed to load campaigns')}</td></tr>`;
    }
}

function renderAdsCampaignsTable(campaigns) {
    const tbody = document.getElementById('adsCampaignsTableBody');
    if (!campaigns.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem">No campaigns yet.</td></tr>';
        return;
    }
    tbody.innerHTML = campaigns.map((c) => {
        const sponsorName = c.sponsor?.name || adsSponsorsCache.find((s) => s.id === c.sponsorId)?.name || c.sponsorId;
        const cities = (c.targeting?.cityIds || []).length;
        const placements = (c.placements || []).map(adPlacementLabel).join(', ') || '—';
        return `
        <tr>
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(sponsorName)}</td>
            <td><span class="badge ${adStatusBadgeClass(c.status)}">${escapeHtml(c.status)}</span></td>
            <td>${c.priority} / ${c.weight}</td>
            <td>${cities} cities</td>
            <td>${escapeHtml(placements)}</td>
            <td>${c.startsAt ? formatDate(c.startsAt) : '—'} – ${c.endsAt ? formatDate(c.endsAt) : '—'}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="btn-small btn-edit" onclick="openAdsCampaignEditor('${c.id}')">Edit</button>
                    <button type="button" class="btn-small btn-delete" onclick="deleteAdsCampaignRow('${c.id}', ${JSON.stringify(c.name)})">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function ensureAdsEditorCities() {
    if (adsCitiesCache.length) return adsCitiesCache;
    const res = await apiRequest('/admin/cities');
    adsCitiesCache = res.success ? res.data : [];
    return adsCitiesCache;
}

async function refreshAdsCampaignSponsorSelect(selectedId) {
    const select = document.getElementById('adCampaignSponsorId');
    if (!select) return;
    try {
        if (!adsSponsorsCache.length) adsSponsorsCache = await fetchAdSponsors();
    } catch {
        /* keep empty */
    }
    select.innerHTML = '<option value="">Select sponsor…</option>' +
        adsSponsorsCache.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    if (selectedId) select.value = selectedId;
}

function showAdsCampaignList() {
    document.getElementById('adsCampaignsListView').style.display = 'block';
    document.getElementById('adsCampaignEditorView').style.display = 'none';
    adsEditingCampaignId = null;
}

function switchAdsEditorTab(tab) {
    document.querySelectorAll('.ads-editor-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.adsEditorTab === tab);
    });
    document.querySelectorAll('.ads-editor-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `adsEditorPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
    });
}

async function openAdsCampaignEditor(campaignId) {
    await ensureAdsEditorCities();
    await refreshAdsCampaignSponsorSelect();
    if (typeof refreshAdsPresetPicker === 'function') await refreshAdsPresetPicker();
    adsEditorLocale = 'en';
    adsEditorVariant = 'A';
    document.getElementById('adsCampaignsListView').style.display = 'none';
    document.getElementById('adsCampaignEditorView').style.display = 'block';
    switchAdsEditorTab('settings');
    renderAdsCityTargetingOptions([]);
    renderAdsSportTargetingOptions([]);
    renderAdsLanguageTargetingOptions([]);
    renderAdsLevelBandOptions([]);
    resetAdsRolloutPercent(100);
    setAdsUserIdLists('', '');
    renderAdsPlacementCheckboxes([]);
    renderAdsLocaleTabs();
    clearAdsCreativeForms();
    renderAdsVariantMatrix([]);
    applyVariantWeightsToForm(undefined);

    if (campaignId) {
        adsEditingCampaignId = campaignId;
        document.getElementById('adsCampaignEditorTitle').textContent = 'Edit Campaign';
        try {
            const campaign = await fetchAdCampaign(campaignId);
            populateAdsCampaignForm(campaign);
            adsCampaignCreativesCache = campaign.creatives || [];
            renderAdsCreativeMatrix(campaign);
            renderAdsVariantMatrix(adsCampaignCreativesCache);
        } catch (error) {
            toast(error.message || 'Failed to load campaign', 'error');
            showAdsCampaignList();
        }
    } else {
        adsEditingCampaignId = null;
        document.getElementById('adsCampaignEditorTitle').textContent = 'New Campaign';
        document.getElementById('adCampaignForm').reset();
        document.getElementById('adCampaignDefaultLocale').value = 'en';
        document.getElementById('adCampaignPriority').value = '0';
        document.getElementById('adCampaignWeight').value = '100';
        document.getElementById('adCampaignStatus').value = 'DRAFT';
        document.getElementById('adCampaignDismissible').checked = true;
        document.getElementById('adCampaignClickUrlTrusted').checked = true;
        document.getElementById('adCampaignHideDisclosure').checked = false;
        document.getElementById('adCampaignFreqCapEnabled').checked = true;
        document.getElementById('adCampaignFreqMax').value = String(AD_DEFAULT_FREQUENCY_CAP.maxImpressions);
        document.getElementById('adCampaignFreqDays').value = String(AD_DEFAULT_FREQUENCY_CAP.windowDays);
        document.getElementById('adCampaignDismissSnoozeDays').value = '7';
        renderAdsCityTargetingOptions([]);
        renderAdsSportTargetingOptions([]);
        renderAdsLanguageTargetingOptions([]);
        renderAdsLevelBandOptions([]);
        resetAdsRolloutPercent(100);
        setAdsUserIdLists('', '');
        renderAdsPlacementCheckboxes([]);
        renderAdsLocaleTabs();
    }
}

function renderAdsCityTargetingOptions(selectedIds) {
    const container = document.getElementById('adCampaignCityIds');
    if (!container) return;
    container.innerHTML = adsCitiesCache.map((city) => `
        <label class="ads-check-item">
            <input type="checkbox" name="cityIds" value="${city.id}" ${selectedIds.includes(city.id) ? 'checked' : ''}>
            ${escapeHtml(city.name)}
        </label>
    `).join('');
}

function renderAdsSportTargetingOptions(selectedSports) {
    const container = document.getElementById('adCampaignSports');
    if (!container) return;
    container.innerHTML = ALL_SPORTS.map((sport) => `
        <label class="ads-check-item">
            <input type="checkbox" name="sports" value="${sport}" ${selectedSports.includes(sport) ? 'checked' : ''}>
            ${escapeHtml(sportLabel(sport))}
        </label>
    `).join('');
    const hint = document.getElementById('adCampaignSportsHint');
    if (hint) hint.textContent = selectedSports.length ? '' : 'None selected = all sports';
    syncAdsLevelBandSportSelect();
}

function renderAdsLanguageTargetingOptions(selectedLanguages) {
    const container = document.getElementById('adCampaignLanguages');
    if (!container) return;
    container.innerHTML = AD_LOCALES.map((loc) => `
        <label class="ads-check-item">
            <input type="checkbox" name="languages" value="${loc.code}" ${selectedLanguages.includes(loc.code) ? 'checked' : ''}>
            ${escapeHtml(loc.label)}
        </label>
    `).join('');
    const hint = document.getElementById('adCampaignLanguagesHint');
    if (hint) hint.textContent = selectedLanguages.length ? '' : 'None selected = all languages';
}

function syncAdsLevelBandSportSelect() {
    const select = document.getElementById('adCampaignLevelBandSport');
    if (!select) return;
    const sports = Array.from(document.querySelectorAll('#adCampaignSports input:checked')).map((el) => el.value);
    const prev = select.value;
    const options = sports.length ? sports : ['PADEL'];
    select.innerHTML = options.map((s) => `<option value="${s}">${escapeHtml(sportLabel(s))}</option>`).join('');
    if (options.includes(prev)) select.value = prev;
}

function syncAdsLevelBandsFromUI() {
    const sport = document.getElementById('adCampaignLevelBandSport')?.value || 'PADEL';
    const currentSportBands = Array.from(document.querySelectorAll('#adCampaignLevelBands input:checked')).map((el) => {
        const [, min, max] = el.value.split(':');
        return { sport, min: parseFloat(min), max: parseFloat(max) };
    });
    const other = adsLevelBandsSelection.filter((b) => b.sport !== sport);
    adsLevelBandsSelection = [...other, ...currentSportBands];
}

function renderAdsLevelBandOptions(selectedBands) {
    const container = document.getElementById('adCampaignLevelBands');
    if (!container) return;
    adsLevelBandsSelection = selectedBands || [];
    syncAdsLevelBandSportSelect();
    const sport = document.getElementById('adCampaignLevelBandSport')?.value || 'PADEL';
    container.innerHTML = AD_LEVEL_BANDS.map((band) => {
        const full = { sport, min: band.min, max: band.max };
        const checked = isLevelBandSelected(full, adsLevelBandsSelection);
        return `
        <label class="ads-check-item">
            <input type="checkbox" name="levelBands" value="${sport}:${band.min}:${band.max}" ${checked ? 'checked' : ''}
                onchange="syncAdsLevelBandsFromUI()">
            ${escapeHtml(band.label)}
        </label>`;
    }).join('');
    const hint = document.getElementById('adCampaignLevelBandsHint');
    if (hint) hint.textContent = adsLevelBandsSelection.length ? '' : 'None selected = all levels';
}

function onAdsLevelBandSportChange() {
    syncAdsLevelBandsFromUI();
    renderAdsLevelBandOptions(adsLevelBandsSelection);
}

function collectAdsLevelBandsFromForm() {
    syncAdsLevelBandsFromUI();
    return [...adsLevelBandsSelection];
}

function resetAdsRolloutPercent(value) {
    const slider = document.getElementById('adCampaignRolloutPercent');
    const input = document.getElementById('adCampaignRolloutPercentInput');
    const v = Math.max(0, Math.min(100, value ?? 100));
    if (slider) slider.value = String(v);
    if (input) input.value = String(v);
}

function onAdsRolloutSliderInput() {
    const slider = document.getElementById('adCampaignRolloutPercent');
    const input = document.getElementById('adCampaignRolloutPercentInput');
    if (slider && input) input.value = slider.value;
}

function onAdsRolloutInputChange() {
    const slider = document.getElementById('adCampaignRolloutPercent');
    const input = document.getElementById('adCampaignRolloutPercentInput');
    if (!slider || !input) return;
    const v = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
    slider.value = String(v);
    input.value = String(v);
}

function setAdsUserIdLists(includeRaw, excludeRaw) {
    const inc = document.getElementById('adCampaignIncludeUserIds');
    const exc = document.getElementById('adCampaignExcludeUserIds');
    if (inc) inc.value = includeRaw ?? '';
    if (exc) exc.value = excludeRaw ?? '';
}

function collectVariantWeightsFromForm() {
    const weights = {};
    AD_VARIANT_KEYS.forEach((vk) => {
        const raw = document.getElementById(`adCampaignVariantWeight_${vk}`)?.value;
        if (!raw) return;
        const n = parseInt(raw, 10);
        if (n > 0) weights[vk] = n;
    });
    return Object.keys(weights).length ? weights : undefined;
}

function applyVariantWeightsToForm(variantWeights) {
    AD_VARIANT_KEYS.forEach((vk) => {
        const el = document.getElementById(`adCampaignVariantWeight_${vk}`);
        if (el) el.value = variantWeights?.[vk] != null ? String(variantWeights[vk]) : '';
    });
}

function collectAdsExtendedTargeting() {
    const cityIds = Array.from(document.querySelectorAll('#adCampaignCityIds input:checked')).map((el) => el.value);
    const sports = Array.from(document.querySelectorAll('#adCampaignSports input:checked')).map((el) => el.value);
    const languages = Array.from(document.querySelectorAll('#adCampaignLanguages input:checked')).map((el) => el.value);
    const levelBands = collectAdsLevelBandsFromForm();
    const rolloutInput = document.getElementById('adCampaignRolloutPercentInput');
    const rolloutPercent = rolloutInput ? Math.max(0, Math.min(100, parseInt(rolloutInput.value, 10) || 100)) : 100;
    const includeUserIds = parseUserIdList(document.getElementById('adCampaignIncludeUserIds')?.value);
    const excludeUserIds = parseUserIdList(document.getElementById('adCampaignExcludeUserIds')?.value);
    const variantWeights = collectVariantWeightsFromForm();
    const targeting = {
        cityIds,
        sports: sports.length ? sports : [],
        languages: languages.length ? languages : [],
        levelBands,
        rolloutPercent,
        includeUserIds,
        excludeUserIds,
    };
    if (variantWeights) targeting.variantWeights = variantWeights;
    return targeting;
}

function applyAdsTargetingToForm(targeting) {
    renderAdsCityTargetingOptions(targeting.cityIds || []);
    renderAdsSportTargetingOptions(targeting.sports || []);
    renderAdsLanguageTargetingOptions(targeting.languages || []);
    renderAdsLevelBandOptions(targeting.levelBands || []);
    resetAdsRolloutPercent(targeting.rolloutPercent ?? 100);
    setAdsUserIdLists(
        formatUserIdList(targeting.includeUserIds),
        formatUserIdList(targeting.excludeUserIds)
    );
    applyVariantWeightsToForm(targeting.variantWeights);
}

function renderAdsPlacementCheckboxes(selected) {
    const container = document.getElementById('adCampaignPlacements');
    if (!container) return;
    container.innerHTML = AD_PLACEMENTS.map((p) => `
        <label class="ads-check-item">
            <input type="checkbox" name="placements" value="${p.key}" ${selected.includes(p.key) ? 'checked' : ''}>
            ${escapeHtml(p.label)} <code>${p.key}</code>
        </label>
    `).join('');
}

function populateAdsCampaignForm(campaign) {
    document.getElementById('adCampaignSponsorId').value = campaign.sponsorId;
    document.getElementById('adCampaignName').value = campaign.name;
    document.getElementById('adCampaignStatus').value = campaign.status;
    document.getElementById('adCampaignPriority').value = String(campaign.priority ?? 0);
    document.getElementById('adCampaignWeight').value = String(campaign.weight ?? 100);
    document.getElementById('adCampaignStartsAt').value = toDatetimeLocalValue(campaign.startsAt);
    document.getElementById('adCampaignEndsAt').value = toDatetimeLocalValue(campaign.endsAt);
    document.getElementById('adCampaignDefaultLocale').value = campaign.defaultLocale || 'en';
    document.getElementById('adCampaignDismissible').checked = campaign.dismissible !== false;
    document.getElementById('adCampaignDismissSnoozeDays').value = campaign.dismissSnoozeDays ?? '';
    document.getElementById('adCampaignClickUrlTrusted').checked = campaign.clickUrlTrusted !== false;
    document.getElementById('adCampaignDisclosureLabel').value = campaign.disclosureLabel || '';
    document.getElementById('adCampaignHideDisclosure').checked = !!campaign.hideDisclosure;
    document.getElementById('adCampaignTestUserIds').value = formatTestUserIds(campaign.testUserIds);

    const cap = campaign.frequencyCap;
    document.getElementById('adCampaignFreqCapEnabled').checked = cap != null;
    document.getElementById('adCampaignFreqMax').value = cap ? String(cap.maxImpressions) : String(AD_DEFAULT_FREQUENCY_CAP.maxImpressions);
    document.getElementById('adCampaignFreqDays').value = cap ? String(cap.windowDays) : String(AD_DEFAULT_FREQUENCY_CAP.windowDays);

    const targeting = campaign.targeting || {};
    applyAdsTargetingToForm(targeting);
    renderAdsPlacementCheckboxes(campaign.placements || []);
}

function collectAdsCampaignPayload() {
    const placements = Array.from(document.querySelectorAll('#adCampaignPlacements input:checked')).map((el) => el.value);
    const freqEnabled = document.getElementById('adCampaignFreqCapEnabled').checked;
    const dismissible = document.getElementById('adCampaignDismissible').checked;

    return {
        sponsorId: document.getElementById('adCampaignSponsorId').value,
        name: document.getElementById('adCampaignName').value.trim(),
        status: document.getElementById('adCampaignStatus').value,
        priority: parseInt(document.getElementById('adCampaignPriority').value, 10) || 0,
        weight: parseInt(document.getElementById('adCampaignWeight').value, 10) || 100,
        startsAt: fromDatetimeLocalValue(document.getElementById('adCampaignStartsAt').value),
        endsAt: fromDatetimeLocalValue(document.getElementById('adCampaignEndsAt').value),
        defaultLocale: document.getElementById('adCampaignDefaultLocale').value,
        frequencyCap: freqEnabled
            ? {
                maxImpressions: parseInt(document.getElementById('adCampaignFreqMax').value, 10) || 3,
                windowDays: parseInt(document.getElementById('adCampaignFreqDays').value, 10) || 7,
            }
            : null,
        dismissible,
        dismissSnoozeDays: dismissible
            ? parseInt(document.getElementById('adCampaignDismissSnoozeDays').value, 10) || null
            : null,
        clickUrlTrusted: document.getElementById('adCampaignClickUrlTrusted').checked,
        disclosureLabel: optionalTrimToNull(document.getElementById('adCampaignDisclosureLabel').value),
        hideDisclosure: document.getElementById('adCampaignHideDisclosure').checked,
        targeting: collectAdsExtendedTargeting(),
        testUserIds: parseTestUserIds(document.getElementById('adCampaignTestUserIds').value),
        placements,
    };
}

async function saveAdsCampaignSettings(e) {
    e.preventDefault();
    const payload = collectAdsCampaignPayload();
    if (!payload.sponsorId || !payload.name) {
        toast('Sponsor and name are required', 'error');
        return;
    }
    try {
        if (adsEditingCampaignId) {
            await updateAdCampaign(adsEditingCampaignId, payload);
            toast('Campaign saved', 'success');
        } else {
            const created = await createAdCampaign(payload);
            adsEditingCampaignId = created.id;
            document.getElementById('adsCampaignEditorTitle').textContent = 'Edit Campaign';
            toast('Campaign created — add creatives next', 'success');
            switchAdsEditorTab('creatives');
        }
        loadAdsCampaignsTab();
    } catch (error) {
        toast(error.message || 'Save failed', 'error');
    }
}

async function deleteAdsCampaignRow(id, name) {
    if (!confirm(`Delete campaign "${name}"?`)) return;
    try {
        await deleteAdCampaign(id);
        toast('Campaign deleted', 'success');
        loadAdsCampaignsTab();
    } catch (error) {
        toast(error.message || 'Delete failed', 'error');
    }
}

function renderAdsLocaleTabs() {
    const container = document.getElementById('adsCreativeLocaleTabs');
    if (!container) return;
    container.innerHTML = AD_LOCALES.map((loc) => `
        <button type="button" class="ads-locale-tab ${loc.code === adsEditorLocale ? 'active' : ''}"
            onclick="selectAdsCreativeLocale('${loc.code}')">${escapeHtml(loc.label)}</button>
    `).join('');
    renderAdsVariantTabs();
}

function renderAdsVariantTabs() {
    const container = document.getElementById('adsCreativeVariantTabs');
    if (!container) return;
    container.innerHTML = AD_VARIANT_KEYS.map((vk) => `
        <button type="button" class="ads-variant-tab ${vk === adsEditorVariant ? 'active' : ''}"
            onclick="selectAdsCreativeVariant('${vk}')">Variant ${vk}</button>
    `).join('');
    renderAdsCreativeFormForLocale(adsEditorLocale, adsEditorVariant);
}

function selectAdsCreativeLocale(code) {
    adsEditorLocale = code;
    renderAdsLocaleTabs();
}

function selectAdsCreativeVariant(variantKey) {
    adsEditorVariant = variantKey;
    renderAdsVariantTabs();
}

function creativeFieldPrefix(locale, placementKey, variantKey) {
    return `creative_${locale}_${placementKey}_${variantKey}`;
}

function clearAdsCreativeForms() {
    AD_LOCALES.forEach((loc) => {
        AD_VARIANT_KEYS.forEach((vk) => {
            AD_PLACEMENTS.forEach((p) => {
                setCreativeFieldValues(creativeFieldPrefix(loc.code, p.key, vk), {});
            });
            setCreativeFieldValues(creativeFieldPrefix(loc.code, 'default', vk), {});
        });
    });
}

function setCreativeFieldValues(prefix, creative) {
    const set = (suffix, val) => {
        const el = document.getElementById(`${prefix}_${suffix}`);
        if (el) {
            if (el.type === 'checkbox') el.checked = !!val;
            else el.value = val ?? '';
        }
    };
    set('title', creative.title);
    set('subtitle', creative.subtitle);
    set('ctaLabel', creative.ctaLabel);
    set('clickUrl', creative.clickUrl);
    set('clickAction', creative.clickAction || 'OPEN_URL');
    set('variantWeight', creativeVariantWeight(creative));
    set('overrideEnabled', creative.placement != null);
    const preview = document.getElementById(`${prefix}_imagePreview`);
    const previewDark = document.getElementById(`${prefix}_imageDarkPreview`);
    if (preview) {
        preview.src = creative.imageUrl || '';
        preview.style.display = creative.imageUrl ? 'block' : 'none';
    }
    if (previewDark) {
        previewDark.src = creative.imageUrlDark || '';
        previewDark.style.display = creative.imageUrlDark ? 'block' : 'none';
    }
}

function renderAdsCreativeMatrix(campaign) {
    clearAdsCreativeForms();
    (campaign.creatives || []).forEach((cr) => {
        const placementKey = cr.placement || 'default';
        const variantKey = cr.variantKey || 'A';
        const prefix = creativeFieldPrefix(cr.locale, placementKey, variantKey);
        setCreativeFieldValues(prefix, cr);
    });
    renderAdsLocaleTabs();
}

function renderAdsVariantMatrix(creatives) {
    const container = document.getElementById('adsVariantMatrix');
    if (!container) return;
    if (!creatives.length) {
        container.innerHTML = '<p class="text-muted">No creatives uploaded yet. Use locale + variant tabs below.</p>';
        return;
    }
    const rows = creatives.map((cr) => {
        const placement = cr.placement ? adPlacementLabel(cr.placement) : 'Default';
        const weight = creativeVariantWeight(cr);
        return `<tr>
            <td>${escapeHtml(adLocaleLabel(cr.locale))}</td>
            <td>${escapeHtml(placement)}</td>
            <td><span class="badge badge-info">${escapeHtml(cr.variantKey || 'A')}</span></td>
            <td>${weight}</td>
            <td>${cr.imageUrl ? '✓' : '—'}</td>
            <td>${escapeHtml(cr.title || '—')}</td>
        </tr>`;
    }).join('');
    container.innerHTML = `
        <table class="ads-variant-matrix-table">
            <thead>
                <tr><th>Locale</th><th>Placement</th><th>Variant</th><th>Weight</th><th>Image</th><th>Title</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function renderAdsCreativeFormForLocale(locale, variantKey) {
    const container = document.getElementById('adsCreativeFormBody');
    if (!container) return;

    const blockHtml = (placementKey, label, isOverride) => {
        const prefix = creativeFieldPrefix(locale, placementKey, variantKey);
        const overrideRow = isOverride
            ? `<label class="ads-check-item ads-override-toggle">
                <input type="checkbox" id="${prefix}_overrideEnabled"> Enable ${escapeHtml(label)} override
               </label>`
            : '';
        return `
        <div class="ads-creative-block ${isOverride ? 'ads-creative-override' : ''}" data-prefix="${prefix}">
            ${isOverride ? `<h4>${escapeHtml(label)} override</h4>${overrideRow}` : `<h4>Default creative — variant ${escapeHtml(variantKey)}</h4>`}
            <div class="ads-creative-fields">
                <div class="form-row">
                    <div class="form-group ads-variant-weight-group">
                        <label>Variant weight</label>
                        <input type="number" id="${prefix}_variantWeight" min="1" step="1" value="100" placeholder="100">
                    </div>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="${prefix}_title">
                    </div>
                    <div class="form-group">
                        <label>Subtitle</label>
                        <input type="text" id="${prefix}_subtitle">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>CTA label</label>
                        <input type="text" id="${prefix}_ctaLabel">
                    </div>
                    <div class="form-group">
                        <label>Click action</label>
                        <select id="${prefix}_clickAction">
                            ${AD_CLICK_ACTIONS.map((a) => `<option value="${a.value}">${a.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Click URL *</label>
                    <input type="text" id="${prefix}_clickUrl" placeholder="https://… or in-app route">
                </div>
                <div class="form-row ads-upload-row">
                    <div class="form-group">
                        <label>Light image</label>
                        <input type="file" accept="image/*" id="${prefix}_imageFile" onchange="previewAdsCreativeImage('${prefix}', 'light')">
                        <img id="${prefix}_imagePreview" class="ads-creative-preview" alt="">
                    </div>
                    <div class="form-group">
                        <label>Dark image (optional)</label>
                        <input type="file" accept="image/*" id="${prefix}_imageDarkFile" onchange="previewAdsCreativeImage('${prefix}', 'dark')">
                        <img id="${prefix}_imageDarkPreview" class="ads-creative-preview ads-creative-preview-dark" alt="">
                    </div>
                </div>
                ${!isOverride
        ? `<button type="button" class="btn-primary btn-small" onclick="uploadAdsCreative('${locale}', null, '${variantKey}')">Upload default</button>`
        : `<button type="button" class="btn-primary btn-small" onclick="uploadAdsCreative('${locale}', '${placementKey}', '${variantKey}')">Upload override</button>`}
            </div>
        </div>`;
    };

    let html = blockHtml('default', '', false);
    html += '<div class="ads-creative-overrides"><h4>Placement overrides</h4>';
    AD_PLACEMENTS.forEach((p) => {
        html += blockHtml(p.key, p.label, true);
    });
    html += '</div>';
    container.innerHTML = html;
}

function previewAdsCreativeImage(prefix, variant) {
    const input = document.getElementById(`${prefix}_${variant === 'dark' ? 'imageDarkFile' : 'imageFile'}`);
    const preview = document.getElementById(`${prefix}_${variant === 'dark' ? 'imageDarkPreview' : 'imagePreview'}`);
    const file = input?.files?.[0];
    if (!file || !preview) return;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
}

async function uploadAdsCreative(locale, placement, variantKey) {
    if (!adsEditingCampaignId) {
        toast('Save campaign settings first', 'error');
        return;
    }
    const vk = variantKey || adsEditorVariant || 'A';
    const placementKey = placement || 'default';
    const prefix = creativeFieldPrefix(locale, placementKey, vk);
    if (placement && !document.getElementById(`${prefix}_overrideEnabled`)?.checked) {
        toast('Enable placement override first', 'error');
        return;
    }
    const clickUrl = document.getElementById(`${prefix}_clickUrl`)?.value?.trim();
    if (!clickUrl) {
        toast('Click URL is required', 'error');
        return;
    }
    const lightFile = document.getElementById(`${prefix}_imageFile`)?.files?.[0];
    if (!lightFile) {
        toast('Light image is required', 'error');
        return;
    }
    const fd = new FormData();
    fd.append('locale', locale);
    if (placement) fd.append('placement', placement);
    fd.append('image', lightFile);
    const darkFile = document.getElementById(`${prefix}_imageDarkFile`)?.files?.[0];
    if (darkFile) fd.append('imageDark', darkFile);
    fd.append('title', document.getElementById(`${prefix}_title`)?.value || '');
    fd.append('subtitle', document.getElementById(`${prefix}_subtitle`)?.value || '');
    fd.append('ctaLabel', document.getElementById(`${prefix}_ctaLabel`)?.value || '');
    fd.append('clickUrl', clickUrl);
    fd.append('clickAction', document.getElementById(`${prefix}_clickAction`)?.value || 'OPEN_URL');
    fd.append('variantKey', vk);
    const weight = parseInt(document.getElementById(`${prefix}_variantWeight`)?.value, 10) || 100;
    fd.append('variantWeight', String(weight));

    try {
        const creative = await uploadAdCreative(adsEditingCampaignId, fd);
        setCreativeFieldValues(prefix, creative);
        const idx = adsCampaignCreativesCache.findIndex((c) =>
            c.locale === creative.locale &&
            (c.placement || null) === (creative.placement || null) &&
            (c.variantKey || 'A') === (creative.variantKey || 'A'));
        if (idx >= 0) adsCampaignCreativesCache[idx] = creative;
        else adsCampaignCreativesCache.push(creative);
        renderAdsVariantMatrix(adsCampaignCreativesCache);
        toast('Creative uploaded', 'success');
    } catch (error) {
        toast(error.message || 'Upload failed', 'error');
    }
}

async function saveAdsPlacementsOnly() {
    if (!adsEditingCampaignId) {
        toast('Save campaign settings first', 'error');
        return;
    }
    const placements = Array.from(document.querySelectorAll('#adCampaignPlacements input:checked')).map((el) => el.value);
    try {
        await updateAdCampaign(adsEditingCampaignId, { placements });
        toast('Placements saved', 'success');
        loadAdsCampaignsTab();
    } catch (error) {
        toast(error.message || 'Save failed', 'error');
    }
}

async function runAdsPreview() {
    if (!adsEditingCampaignId) {
        toast('Save campaign first', 'error');
        return;
    }
    const userId = document.getElementById('adPreviewUserId').value.trim();
    const placement = document.getElementById('adPreviewPlacement').value;
    const locale = document.getElementById('adPreviewLocale').value;
    const variantKey = document.getElementById('adPreviewVariant')?.value || 'A';
    const resultEl = document.getElementById('adPreviewResult');
    resultEl.innerHTML = 'Loading preview…';
    try {
        const data = await fetchAdPreview({
            campaignId: adsEditingCampaignId,
            userId: userId || undefined,
            placement,
            locale,
            variantKey,
        });
        if (!data || data.empty) {
            resultEl.innerHTML = '<p class="text-muted">No creative resolved for this context.</p>';
            return;
        }
        const disclosure = data.hideDisclosure
            ? ''
            : `<span class="ads-preview-disclosure">${escapeHtml(data.disclosureLabel || 'Sponsored')}</span>`;
        resultEl.innerHTML = `
            <div class="ads-preview-card">
                ${disclosure}
                <img src="${escapeHtmlAttr(data.imageUrl)}" alt="" class="ads-preview-image">
                ${data.title ? `<div class="ads-preview-title">${escapeHtml(data.title)}</div>` : ''}
                ${data.subtitle ? `<div class="ads-preview-subtitle">${escapeHtml(data.subtitle)}</div>` : ''}
                ${data.ctaLabel ? `<div class="ads-preview-cta">${escapeHtml(data.ctaLabel)}</div>` : ''}
                <div class="ads-preview-meta text-muted">
                    Campaign: ${escapeHtml(data.campaignName || adsEditingCampaignId)} ·
                    ${data.clickUrlTrusted === false ? 'Leaving Bandeja interstitial' : 'Trusted URL'}
                </div>
            </div>`;
    } catch (error) {
        resultEl.innerHTML = `<p class="error">${escapeHtml(error.message || 'Preview failed')}</p>`;
    }
}

function initAdsCampaignEditorTabs() {
    document.querySelectorAll('.ads-editor-tab').forEach((btn) => {
        btn.addEventListener('click', () => switchAdsEditorTab(btn.dataset.adsEditorTab));
    });
}

window.openAdsCampaignEditor = openAdsCampaignEditor;
window.showAdsCampaignList = showAdsCampaignList;
window.saveAdsCampaignSettings = saveAdsCampaignSettings;
window.deleteAdsCampaignRow = deleteAdsCampaignRow;
window.selectAdsCreativeLocale = selectAdsCreativeLocale;
window.selectAdsCreativeVariant = selectAdsCreativeVariant;
window.onAdsLevelBandSportChange = onAdsLevelBandSportChange;
window.syncAdsLevelBandsFromUI = syncAdsLevelBandsFromUI;
window.onAdsRolloutSliderInput = onAdsRolloutSliderInput;
window.onAdsRolloutInputChange = onAdsRolloutInputChange;
window.previewAdsCreativeImage = previewAdsCreativeImage;
window.uploadAdsCreative = uploadAdsCreative;
window.saveAdsPlacementsOnly = saveAdsPlacementsOnly;
window.runAdsPreview = runAdsPreview;
window.refreshAdsCampaignSponsorSelect = refreshAdsCampaignSponsorSelect;

document.addEventListener('DOMContentLoaded', initAdsCampaignEditorTabs);
