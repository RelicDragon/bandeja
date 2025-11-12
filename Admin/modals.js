function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
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
        }

        if (timezonesResponse.success) {
            const timezoneSelect = document.getElementById('cityTimezone');
            const currentValue = timezoneSelect.value;
            timezoneSelect.innerHTML = `<option value="">Default (${timezonesResponse.default})</option>` +
                timezonesResponse.data.map(timezone => 
                    `<option value="${timezone}">${timezone}</option>`
                ).join('');
            if (currentValue) timezoneSelect.value = currentValue;
        }
    } catch (error) {
        console.error('Failed to load countries and timezones:', error);
    }
}

function createCityModal() {
    showModal('cityModal');
    document.getElementById('cityModalTitle').textContent = 'Create City';
    document.getElementById('cityForm').reset();
    document.getElementById('cityForm').dataset.mode = 'create';
    document.getElementById('cityForm').dataset.cityId = '';
    loadCountriesAndTimezones();
}

function editCityModal(city) {
    showModal('cityModal');
    document.getElementById('cityModalTitle').textContent = 'Edit City';
    document.getElementById('cityName').value = city.name;
    document.getElementById('cityCountry').value = city.country;
    document.getElementById('cityTimezone').value = city.timezone;
    document.getElementById('cityIsActive').checked = city.isActive;
    document.getElementById('cityForm').dataset.mode = 'edit';
    document.getElementById('cityForm').dataset.cityId = city.id;
    loadCountriesAndTimezones();
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

function createCenterModal() {
    showModal('centerModal');
    document.getElementById('centerModalTitle').textContent = 'Create Club';
    document.getElementById('centerForm').reset();
    document.getElementById('centerForm').dataset.mode = 'create';
    document.getElementById('centerForm').dataset.centerId = '';
    loadCityOptions();
}

function editCenterModal(center) {
    showModal('centerModal');
    document.getElementById('centerModalTitle').textContent = 'Edit Club';
    document.getElementById('centerName').value = center.name;
    document.getElementById('centerDescription').value = center.description || '';
    document.getElementById('centerAddress').value = center.address;
    document.getElementById('centerCityId').value = center.cityId;
    document.getElementById('centerPhone').value = center.phone || '';
    document.getElementById('centerEmail').value = center.email || '';
    document.getElementById('centerWebsite').value = center.website || '';
    document.getElementById('centerOpeningTime').value = center.openingTime || '';
    document.getElementById('centerClosingTime').value = center.closingTime || '';
    document.getElementById('centerIsActive').checked = center.isActive;
    document.getElementById('centerIsBar').checked = center.isBar || false;
    document.getElementById('centerIsForPlaying').checked = center.isForPlaying !== undefined ? center.isForPlaying : true;
    document.getElementById('centerForm').dataset.mode = 'edit';
    document.getElementById('centerForm').dataset.centerId = center.id;
    loadCityOptions();
}

async function loadCityOptions() {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('centerCityId');
            select.innerHTML = '<option value="">Select City</option>' +
                response.data.map(city => 
                    `<option value="${city.id}">${city.name}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
    }
}

async function handleCenterSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const centerId = form.dataset.centerId;

    const formData = new FormData(form);
    const data = {
        name: formData.get('centerName') || document.getElementById('centerName').value,
        description: formData.get('centerDescription') || document.getElementById('centerDescription').value || null,
        address: formData.get('centerAddress') || document.getElementById('centerAddress').value,
        cityId: formData.get('centerCityId') || document.getElementById('centerCityId').value,
        phone: formData.get('centerPhone') || document.getElementById('centerPhone').value || null,
        email: formData.get('centerEmail') || document.getElementById('centerEmail').value || null,
        website: formData.get('centerWebsite') || document.getElementById('centerWebsite').value || null,
        openingTime: formData.get('centerOpeningTime') || document.getElementById('centerOpeningTime').value || null,
        closingTime: formData.get('centerClosingTime') || document.getElementById('centerClosingTime').value || null,
        isActive: document.getElementById('centerIsActive').checked,
        isBar: document.getElementById('centerIsBar').checked,
        isForPlaying: document.getElementById('centerIsForPlaying').checked,
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
    loadUserCityOptions();
}

function editUserModal(user) {
    showModal('userModal');
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userFirstName').value = user.firstName || '';
    document.getElementById('userLastName').value = user.lastName || '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userGender').value = user.gender || 'PREFER_NOT_TO_SAY';
    const levelValue = typeof user.level === 'number' ? user.level : (user.level || 3.5);
    document.getElementById('userLevel').value = levelValue.toString().replace(',', '.');
    document.getElementById('userCityId').value = user.currentCity?.id || '';
    document.getElementById('userIsActive').checked = user.isActive;
    document.getElementById('userIsAdmin').checked = user.isAdmin;
    document.getElementById('userIsTrainer').checked = user.isTrainer || false;
    document.getElementById('userCanCreateTournament').checked = user.canCreateTournament || false;
    document.getElementById('userCanCreateLeague').checked = user.canCreateLeague || false;
    document.getElementById('userForm').dataset.mode = 'edit';
    document.getElementById('userForm').dataset.userId = user.id;
    loadUserCityOptions();
}

async function loadUserCityOptions() {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('userCityId');
            select.innerHTML = '<option value="">No City</option>' +
                response.data.map(city => 
                    `<option value="${city.id}">${city.name}</option>`
                ).join('');
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
        loadUsers();
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

window.closeModal = closeModal;
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

