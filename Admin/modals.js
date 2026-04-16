function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function openModal(modalId) {
    showModal(modalId);
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function formatTimeForHtmlInput(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    const tPart = s.includes('T') ? s.split('T').pop() : s;
    const iso = tPart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (iso) return `${String(iso[1]).padStart(2, '0')}:${iso[2]}`;
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) {
        const d = new Date(ms);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }
    return '';
}

function optionalTrimToNull(v) {
    if (v == null) return null;
    const t = String(v).trim();
    return t === '' ? null : t;
}

function normalizeWebsiteForApi(raw) {
    const t = optionalTrimToNull(raw);
    if (t === null) return null;
    const trimmed = t.replace(/\s/g, '');
    if (trimmed === '') return null;
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const u = new URL(trimmed);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
            return u.href;
        } catch {
            return null;
        }
    }
    const head = trimmed.split('/')[0];
    const hostLike =
        /^localhost(:\d+)?$/i.test(head) || /^[\w.-]+\.[a-z0-9-]{2,}$/i.test(head);
    if (!hostLike) return trimmed;
    try {
        const u = new URL('https://' + trimmed.replace(/^\/+/, ''));
        if (u.protocol !== 'https:') return null;
        return u.href;
    } catch {
        return null;
    }
}

function cf(form, fieldId) {
    return form.querySelector('#' + fieldId);
}

const CLUB_FORM_CONTROL_IDS = [
    'centerName',
    'centerDescription',
    'centerAddress',
    'centerCityId',
    'centerPhone',
    'centerEmail',
    'centerWebsite',
    'centerOpeningTime',
    'centerClosingTime',
    'centerLatitude',
    'centerLongitude',
    'centerIsActive',
    'centerIsBar',
    'centerIsForPlaying',
];

function assertClubFormControls(form) {
    for (const id of CLUB_FORM_CONTROL_IDS) {
        if (!cf(form, id)) {
            alert(`Club form is missing control “${id}”. Refresh the page.`);
            return false;
        }
    }
    return true;
}

async function loadCountriesAndTimezones() {
    try {
        const [countriesResponse, timezonesResponse] = await Promise.all([
            apiRequest('/cities/meta/countries'),
            apiRequest('/cities/meta/timezones')
        ]);

        if (countriesResponse.success) {
            const countrySelect = document.getElementById('cityCountry');
            const currentValue = countrySelect.value;
            countrySelect.innerHTML = '<option value="">Select Country</option>' +
                countriesResponse.data.map(country => 
                    `<option value="${country}">${country}</option>`
                ).join('');
            if (currentValue) countrySelect.value = currentValue;
        } else {
            alert(countriesResponse.message || 'Could not load country list.');
        }

        if (timezonesResponse.success) {
            const timezoneSelect = document.getElementById('cityTimezone');
            const currentValue = timezoneSelect.value;
            timezoneSelect.innerHTML = `<option value="">Default (${timezonesResponse.default})</option>` +
                timezonesResponse.data.map(timezone => 
                    `<option value="${timezone}">${timezone}</option>`
                ).join('');
            if (currentValue) timezoneSelect.value = currentValue;
        } else {
            alert(timezonesResponse.message || 'Could not load timezone list.');
        }
    } catch (error) {
        console.error('Failed to load countries and timezones:', error);
        alert('Could not load country or timezone list. Check your connection and try again.');
    }
}

async function createCityModal() {
    showModal('cityModal');
    document.getElementById('cityModalTitle').textContent = 'Create City';
    document.getElementById('cityForm').reset();
    document.getElementById('cityForm').dataset.mode = 'create';
    document.getElementById('cityForm').dataset.cityId = '';
    await loadCountriesAndTimezones();
}

async function editCityModal(city) {
    showModal('cityModal');
    document.getElementById('cityModalTitle').textContent = 'Edit City';
    document.getElementById('cityForm').dataset.mode = 'edit';
    document.getElementById('cityForm').dataset.cityId = city.id;
    await loadCountriesAndTimezones();
    document.getElementById('cityName').value = city.name;
    document.getElementById('cityCountry').value = city.country;
    document.getElementById('cityTimezone').value = city.timezone || '';
    document.getElementById('cityIsActive').checked = city.isActive;
}

async function handleCitySubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const cityId = form.dataset.cityId;

    const timezone = document.getElementById('cityTimezone').value;
    const data = {
        name: document.getElementById('cityName').value,
        country: document.getElementById('cityCountry').value,
        isActive: document.getElementById('cityIsActive').checked,
    };

    if (timezone) {
        data.timezone = timezone;
    }

    try {
        if (mode === 'create') {
            await apiRequest('/admin/cities', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } else {
            await apiRequest(`/admin/cities/${cityId}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        }
        closeModal('cityModal');
        loadCities();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteCity(cityId, cityName) {
    if (!confirm(`Are you sure you want to delete ${cityName}?`)) return;

    try {
        await apiRequest(`/admin/cities/${cityId}`, {
            method: 'DELETE',
        });
        loadCities();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function createCenterModal() {
    showModal('centerModal');
    document.getElementById('centerModalTitle').textContent = 'Create Club';
    document.getElementById('centerForm').reset();
    document.getElementById('centerForm').dataset.mode = 'create';
    document.getElementById('centerForm').dataset.centerId = '';
    document.getElementById('centerMediaSection').style.display = 'none';
    const pr = document.getElementById('centerAvatarPreview');
    pr.removeAttribute('src');
    pr.style.display = 'none';
    document.getElementById('centerAvatarRemoveBtn').style.display = 'none';
    document.getElementById('centerPhotosList').innerHTML = '';
    document.getElementById('centerAvatarFile').value = '';
    document.getElementById('centerPhotoFile').value = '';
    await loadCityOptions();
}

async function editCenterModal(center) {
    const form = document.getElementById('centerForm');
    if (!form || !assertClubFormControls(form)) return;
    showModal('centerModal');
    document.getElementById('centerModalTitle').textContent = 'Edit Club';
    cf(form, 'centerName').value = center.name;
    cf(form, 'centerDescription').value = center.description || '';
    cf(form, 'centerAddress').value = center.address;
    cf(form, 'centerPhone').value = center.phone || '';
    cf(form, 'centerEmail').value = center.email || '';
    cf(form, 'centerWebsite').value = center.website || '';
    cf(form, 'centerOpeningTime').value = formatTimeForHtmlInput(center.openingTime);
    cf(form, 'centerClosingTime').value = formatTimeForHtmlInput(center.closingTime);
    cf(form, 'centerLatitude').value =
        center.latitude != null && center.latitude !== '' ? String(center.latitude) : '';
    cf(form, 'centerLongitude').value =
        center.longitude != null && center.longitude !== '' ? String(center.longitude) : '';
    cf(form, 'centerIsActive').checked = center.isActive;
    cf(form, 'centerIsBar').checked = center.isBar || false;
    cf(form, 'centerIsForPlaying').checked = center.isForPlaying !== undefined ? center.isForPlaying : true;
    form.dataset.mode = 'edit';
    form.dataset.centerId = center.id;
    document.getElementById('centerMediaSection').style.display = 'block';
    const pr = document.getElementById('centerAvatarPreview');
    const rmBtn = document.getElementById('centerAvatarRemoveBtn');
    if (center.avatar) {
        pr.src = center.avatar;
        pr.style.display = 'block';
        rmBtn.style.display = 'inline-block';
    } else {
        pr.removeAttribute('src');
        pr.style.display = 'none';
        rmBtn.style.display = 'none';
    }
    document.getElementById('centerAvatarFile').value = '';
    document.getElementById('centerPhotoFile').value = '';
    editingClubPhotos = normalizeClubPhotosAdmin(center.photos);
    renderEditingClubPhotos(center.id);
    await loadCityOptions(center.cityId);
}

let editingClubPhotos = [];

function normalizeClubPhotosAdmin(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((p) => p && typeof p.originalUrl === 'string' && typeof p.thumbnailUrl === 'string');
}

function renderEditingClubPhotos(clubId) {
    const box = document.getElementById('centerPhotosList');
    if (!box) return;
    box.innerHTML = '';
    editingClubPhotos.forEach((ph) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid #ccc;';
        const img = document.createElement('img');
        img.src = ph.thumbnailUrl;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        wrap.appendChild(img);
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.style.cssText = 'position:absolute;top:2px;right:2px;width:22px;height:22px;border:none;border-radius:50%;background:#c00;color:#fff;cursor:pointer;line-height:1;font-size:14px;';
        del.onclick = async () => {
            if (!confirm('Remove this photo?')) return;
            const url = ph.originalUrl;
            editingClubPhotos = editingClubPhotos.filter((x) => x.originalUrl !== url);
            try {
                await apiRequest(`/admin/clubs/${clubId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ photos: editingClubPhotos }),
                });
                renderEditingClubPhotos(clubId);
                loadClubs();
            } catch (err) {
                alert('Error: ' + err.message);
            }
        };
        wrap.appendChild(del);
        box.appendChild(wrap);
    });
}

async function loadCityOptions(selectedCityId) {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('centerCityId');
            select.innerHTML = '<option value="">Select City</option>' +
                response.data.map(city => 
                    `<option value="${city.id}">${city.name}</option>`
                ).join('');
            if (selectedCityId) {
                select.value = selectedCityId;
            }
        } else {
            alert(response.message || 'Could not load cities for this form.');
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
        alert(error.message || 'Could not load cities. Check your connection and try again.');
    }
}

async function handleCenterSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!assertClubFormControls(form)) return;
    const mode = form.dataset.mode;
    const centerId = form.dataset.centerId;

    const formData = new FormData(form);
    const latStr = String(formData.get('centerLatitude') ?? cf(form, 'centerLatitude').value ?? '').trim();
    const lngStr = String(formData.get('centerLongitude') ?? cf(form, 'centerLongitude').value ?? '').trim();
    let latitude = null;
    let longitude = null;
    if (latStr) {
        latitude = Number(latStr);
        if (!Number.isFinite(latitude)) {
            alert('Invalid latitude');
            return;
        }
    }
    if (lngStr) {
        longitude = Number(lngStr);
        if (!Number.isFinite(longitude)) {
            alert('Invalid longitude');
            return;
        }
    }

    const websiteRaw = formData.get('centerWebsite');
    const website = normalizeWebsiteForApi(websiteRaw);
    if (optionalTrimToNull(websiteRaw) !== null && website === null) {
        alert('Invalid website. Leave blank, use a full https://… URL, or a hostname such as example.com');
        return;
    }

    const data = {
        name: String(formData.get('centerName') ?? cf(form, 'centerName').value ?? '').trim(),
        description: optionalTrimToNull(formData.get('centerDescription')),
        address: String(formData.get('centerAddress') ?? cf(form, 'centerAddress').value ?? '').trim(),
        cityId: String(formData.get('centerCityId') ?? cf(form, 'centerCityId').value ?? '').trim(),
        phone: optionalTrimToNull(formData.get('centerPhone')),
        email: optionalTrimToNull(formData.get('centerEmail')),
        website,
        openingTime: optionalTrimToNull(formData.get('centerOpeningTime')),
        closingTime: optionalTrimToNull(formData.get('centerClosingTime')),
        latitude: latStr ? latitude : null,
        longitude: lngStr ? longitude : null,
        isActive: cf(form, 'centerIsActive').checked,
        isBar: cf(form, 'centerIsBar').checked,
        isForPlaying: cf(form, 'centerIsForPlaying').checked,
    };

    try {
        if (mode === 'create') {
            await apiRequest('/admin/clubs', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } else {
            await apiRequest(`/admin/clubs/${centerId}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        }
        closeModal('centerModal');
        loadClubs();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteClub(centerId, centerName) {
    if (!confirm(`Are you sure you want to delete ${centerName}?`)) return;

    try {
        await apiRequest(`/admin/clubs/${centerId}`, {
            method: 'DELETE',
        });
        loadClubs();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function createCourtForCenter() {
    if (!currentCenter) {
        alert('No center selected');
        return;
    }
    showModal('courtModal');
    document.getElementById('courtModalTitle').textContent = `Add Court to ${currentCenter.name}`;
    document.getElementById('courtForm').reset();
    document.getElementById('courtForm').dataset.mode = 'create';
    document.getElementById('courtForm').dataset.courtId = '';
    document.getElementById('courtClubId').value = currentCenter.id;
    document.getElementById('courtCenterName').textContent = `${currentCenter.name} - ${currentCenter.city.name}`;
}

function editCourtModal(court) {
    showModal('courtModal');
    document.getElementById('courtModalTitle').textContent = 'Edit Court';
    document.getElementById('courtName').value = court.name;
    document.getElementById('courtClubId').value = court.clubId;
    document.getElementById('courtCenterName').textContent = `${court.club.name} - ${court.club.city.name}`;
    document.getElementById('courtType').value = court.courtType || '';
    document.getElementById('courtIsIndoor').checked = court.isIndoor;
    document.getElementById('courtSurfaceType').value = court.surfaceType || '';
    document.getElementById('courtPricePerHour').value = court.pricePerHour || '';
    document.getElementById('courtIsActive').checked = court.isActive;
    document.getElementById('courtForm').dataset.mode = 'edit';
    document.getElementById('courtForm').dataset.courtId = court.id;
}


async function handleCourtSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const courtId = form.dataset.courtId;

    const priceValue = document.getElementById('courtPricePerHour').value;

    const data = {
        name: document.getElementById('courtName').value,
        clubId: document.getElementById('courtClubId').value,
        courtType: document.getElementById('courtType').value || null,
        isIndoor: document.getElementById('courtIsIndoor').checked,
        surfaceType: document.getElementById('courtSurfaceType').value || null,
        pricePerHour: priceValue ? parseFloat(priceValue) : null,
        isActive: document.getElementById('courtIsActive').checked,
    };

    try {
        if (mode === 'create') {
            await apiRequest('/admin/courts', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } else {
            await apiRequest(`/admin/courts/${courtId}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        }
        closeModal('courtModal');
        if (currentCenter) {
            loadCourtsForCenter(currentCenter.id);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteCourt(courtId, courtName) {
    if (!confirm(`Are you sure you want to delete ${courtName}?`)) return;

    try {
        await apiRequest(`/admin/courts/${courtId}`, {
            method: 'DELETE',
        });
        if (currentCenter) {
            loadCourtsForCenter(currentCenter.id);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function createUserModal() {
    showModal('userModal');
    document.getElementById('userModalTitle').textContent = 'Create User';
    document.getElementById('userForm').reset();
    document.getElementById('userForm').dataset.mode = 'create';
    document.getElementById('userForm').dataset.userId = '';
    document.getElementById('userPasswordGroup').style.display = '';
    loadUserCityOptions();
}

async function editUserModal(user) {
    showModal('userModal');
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userPasswordGroup').style.display = 'none';
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userFirstName').value = user.firstName || '';
    document.getElementById('userLastName').value = user.lastName || '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userGender').value = user.gender || 'PREFER_NOT_TO_SAY';
    const levelValue = typeof user.level === 'number' ? user.level : (user.level || 3.5);
    document.getElementById('userLevel').value = levelValue.toString().replace(',', '.');
    document.getElementById('userIsActive').checked = user.isActive;
    document.getElementById('userIsAdmin').checked = user.isAdmin;
    document.getElementById('userIsTrainer').checked = user.isTrainer || false;
    document.getElementById('userCanCreateTournament').checked = user.canCreateTournament || false;
    document.getElementById('userCanCreateLeague').checked = user.canCreateLeague || false;
    document.getElementById('userForm').dataset.mode = 'edit';
    document.getElementById('userForm').dataset.userId = user.id;
    await loadUserCityOptions(user.currentCity?.id || '');
}

async function loadUserCityOptions(selectedCityId) {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('userCityId');
            select.innerHTML = '<option value="">No City</option>' +
                response.data.map(city =>
                    `<option value="${city.id}">${city.name}</option>`
                ).join('');
            if (selectedCityId) select.value = selectedCityId;
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
    }
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const userId = form.dataset.userId;

    const firstName = document.getElementById('userFirstName').value || '';
    const lastName = document.getElementById('userLastName').value || '';
    const combinedName = `${firstName}${lastName}`.trim();
    const alphabeticChars = combinedName.replace(/[^a-zA-Z]/g, '');
    
    if (alphabeticChars.length < 3) {
        alert('Error: First name and last name combined must contain at least 3 alphabetic characters');
        return;
    }

    const levelValue = document.getElementById('userLevel').value;
    const cityId = document.getElementById('userCityId').value;
    
    let parsedLevel = 3.5;
    if (levelValue) {
        const cleanedLevel = levelValue.toString().replace(/,/g, '.');
        parsedLevel = parseFloat(cleanedLevel);
        if (isNaN(parsedLevel)) {
            parsedLevel = 3.5;
        }
    }

    const data = {
        phone: document.getElementById('userPhone').value,
        firstName: firstName || null,
        lastName: lastName || null,
        email: document.getElementById('userEmail').value || null,
        gender: document.getElementById('userGender').value,
        level: parsedLevel,
        currentCityId: cityId || null,
        isActive: document.getElementById('userIsActive').checked,
        isAdmin: document.getElementById('userIsAdmin').checked,
        isTrainer: document.getElementById('userIsTrainer').checked,
        canCreateTournament: document.getElementById('userCanCreateTournament').checked,
        canCreateLeague: document.getElementById('userCanCreateLeague').checked,
    };
    if (mode === 'create') {
        const pwd = document.getElementById('userPassword')?.value?.trim();
        if (pwd) data.password = pwd;
    }

    try {
        if (mode === 'create') {
            await apiRequest('/admin/users', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } else {
            await apiRequest(`/admin/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        }
        closeModal('userModal');
        loadUsers(mode === 'create' ? 1 : (window.usersCurrentPage || 1));
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function resetPasswordModal(userId, userName) {
    showModal('resetPasswordModal');
    document.getElementById('resetPasswordUserName').textContent = userName;
    document.getElementById('resetPasswordForm').dataset.userId = userId;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const userId = form.dataset.userId;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('Error: Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        alert('Error: Password must be at least 6 characters long');
        return;
    }

    try {
        await apiRequest(`/admin/users/${userId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword }),
        });
        closeModal('resetPasswordModal');
        alert('Password reset successfully');
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function emitCoinsModal(userId, userName) {
    showModal('emitCoinsModal');
    document.getElementById('emitCoinsUserName').textContent = userName;
    document.getElementById('emitCoinsForm').dataset.userId = userId;
    document.getElementById('coinAmount').value = '';
    document.getElementById('coinDescription').value = '';
}

async function handleEmitCoinsSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const userId = form.dataset.userId;
    const amount = parseInt(document.getElementById('coinAmount').value);
    const description = document.getElementById('coinDescription').value;

    if (!amount || amount <= 0) {
        alert('Error: Amount must be a positive integer');
        return;
    }

    try {
        await apiRequest(`/admin/users/${userId}/emit-coins`, {
            method: 'POST',
            body: JSON.stringify({ amount, description: description || undefined }),
        });
        closeModal('emitCoinsModal');
        alert(`Successfully emitted ${amount} coins to user`);
        loadUsers();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function dropCoinsModal() {
    showModal('dropCoinsModal');
    const cityFilter = document.getElementById('globalCityFilter');
    const selectedCity = cityFilter?.options[cityFilter.selectedIndex]?.text;
    const targetText = selectedCity && selectedCity !== 'All Cities' 
        ? `All users in ${selectedCity}` 
        : 'All users';
    document.getElementById('dropCoinsTarget').textContent = targetText;
    document.getElementById('dropCoinAmount').value = '';
    document.getElementById('dropCoinDescription').value = '';
}

async function handleDropCoinsSubmit(e) {
    e.preventDefault();
    const amount = parseInt(document.getElementById('dropCoinAmount').value);
    const description = document.getElementById('dropCoinDescription').value;

    if (!amount || amount <= 0) {
        alert('Error: Amount must be a positive integer');
        return;
    }

    const cityId = selectedCityId || '';
    const queryParams = cityId ? `?cityId=${cityId}` : '';

    if (!confirm(`Are you sure you want to drop ${amount} coins to all users? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await apiRequest(`/admin/coins/drop${queryParams}`, {
            method: 'POST',
            body: JSON.stringify({ amount, description: description || undefined }),
        });
        closeModal('dropCoinsModal');
        if (response.data) {
            alert(`${response.message}\n\nSuccessful: ${response.data.successful}\nFailed: ${response.data.failed}\nTotal: ${response.data.totalUsers}`);
        } else {
            alert('Successfully dropped coins');
        }
        loadStats();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.closeModal = closeModal;
window.openModal = openModal;
window.createCityModal = createCityModal;
window.editCityModal = editCityModal;
window.handleCitySubmit = handleCitySubmit;
window.deleteCity = deleteCity;
window.createCenterModal = createCenterModal;
window.editCenterModal = editCenterModal;
window.handleCenterSubmit = handleCenterSubmit;
window.deleteClub = deleteClub;
window.createCourtForCenter = createCourtForCenter;
window.editCourtModal = editCourtModal;
window.handleCourtSubmit = handleCourtSubmit;
window.deleteCourt = deleteCourt;
window.createUserModal = createUserModal;
window.editUserModal = editUserModal;
window.handleUserSubmit = handleUserSubmit;
window.resetPasswordModal = resetPasswordModal;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;
window.emitCoinsModal = emitCoinsModal;
window.handleEmitCoinsSubmit = handleEmitCoinsSubmit;
window.dropCoinsModal = dropCoinsModal;
window.handleDropCoinsSubmit = handleDropCoinsSubmit;

(function setupClubMediaUploads() {
    const af = document.getElementById('centerAvatarFile');
    const pf = document.getElementById('centerPhotoFile');
    const rm = document.getElementById('centerAvatarRemoveBtn');
    if (!af || !pf || !rm) return;
    af.addEventListener('change', async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const centerId = document.getElementById('centerForm').dataset.centerId;
        const mode = document.getElementById('centerForm').dataset.mode;
        if (mode !== 'edit' || !centerId) {
            alert('Save the club first, then edit it to upload an avatar.');
            return;
        }
        try {
            const fd = new FormData();
            fd.append('original', file);
            fd.append('clubId', centerId);
            const res = await window.apiMultipartRequest('/media/upload/club/avatar', fd);
            const pr = document.getElementById('centerAvatarPreview');
            pr.src = res.data.avatarUrl;
            pr.style.display = 'block';
            rm.style.display = 'inline-block';
            loadClubs();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });
    pf.addEventListener('change', async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const centerId = document.getElementById('centerForm').dataset.centerId;
        const mode = document.getElementById('centerForm').dataset.mode;
        if (mode !== 'edit' || !centerId) {
            alert('Save the club first, then edit it to upload photos.');
            return;
        }
        try {
            const fd = new FormData();
            fd.append('image', file);
            fd.append('clubId', centerId);
            const res = await window.apiMultipartRequest('/media/upload/club/photo', fd);
            editingClubPhotos = normalizeClubPhotosAdmin(res.data.photos);
            renderEditingClubPhotos(centerId);
            loadClubs();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });
    rm.addEventListener('click', async () => {
        const centerId = document.getElementById('centerForm').dataset.centerId;
        if (!centerId) return;
        if (!confirm('Remove club avatar?')) return;
        try {
            await apiRequest(`/admin/clubs/${centerId}`, {
                method: 'PUT',
                body: JSON.stringify({ avatar: null, originalAvatar: null }),
            });
            const pr = document.getElementById('centerAvatarPreview');
            pr.removeAttribute('src');
            pr.style.display = 'none';
            rm.style.display = 'none';
            loadClubs();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });
})();

