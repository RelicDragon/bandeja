let API_URL = localStorage.getItem('apiUrl') || 'http://localhost:9000/api';
let authToken = null;
let selectedCityId = '';
let currentInvites = [];
let usersDataTable = null;
let gamesDataTable = null;
let onlineUsersPollInterval = null;

const elements = {
    loginPage: document.getElementById('loginPage'),
    dashboardPage: document.getElementById('dashboardPage'),
    loginForm: document.getElementById('loginForm'),
    loginError: document.getElementById('loginError'),
    logoutBtn: document.getElementById('logoutBtn'),
    adminName: document.getElementById('adminName'),
    navLinks: document.querySelectorAll('.nav-link'),
    contentPages: document.querySelectorAll('.content-page'),
};

function showError(message) {
    elements.loginError.textContent = message;
    setTimeout(() => {
        elements.loginError.textContent = '';
    }, 5000);
}

function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
        ...options.headers,
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const apiUrl = document.getElementById('apiUrl').value;

    API_URL = apiUrl;
    localStorage.setItem('apiUrl', apiUrl);

    try {
        const response = await apiRequest('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password }),
        });

        if (response.success) {
            authToken = response.data.token;
            localStorage.setItem('adminToken', authToken);
            localStorage.setItem('adminData', JSON.stringify(response.data.user));
            showDashboard(response.data.user);
        }
    } catch (error) {
        showError(error.message || 'Invalid credentials');
    }
});

elements.logoutBtn.addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    elements.loginPage.style.display = 'flex';
    elements.dashboardPage.style.display = 'none';
});

elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        switchPage(page);
    });
});

function switchPage(pageName) {
    elements.navLinks.forEach(link => link.classList.remove('active'));
    elements.contentPages.forEach(page => page.classList.remove('active'));

    if (pageName !== 'logs' && isStreamActive) {
        stopLogStream();
    }
    if (pageName !== 'online-users' && onlineUsersPollInterval) {
        clearInterval(onlineUsersPollInterval);
        onlineUsersPollInterval = null;
    }

    const activeLink = document.querySelector(`[data-page="${pageName}"]`);
    const pageId = pageName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + 'Page';
    const activePage = document.getElementById(pageId);

    if (activeLink) activeLink.classList.add('active');
    if (activePage) {
        activePage.classList.add('active');
        loadPageData(pageName);
    }
}

function showDashboard(user) {
    elements.loginPage.style.display = 'none';
    elements.dashboardPage.style.display = 'flex';
    elements.adminName.textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.phone;
    loadGlobalCityFilter();
    loadStats();
}

async function loadGlobalCityFilter() {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('globalCityFilter');
            select.innerHTML = '<option value="">All Cities</option>' +
                response.data.map(city => 
                    `<option value="${city.id}">${city.name}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
    }
}

function handleGlobalCityChange() {
    selectedCityId = document.getElementById('globalCityFilter').value;
    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
        const page = activeLink.dataset.page;
        loadPageData(page);
    }
}

async function loadStats() {
    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/stats${queryParams}`);
        if (response.success) {
            const stats = response.data;
            document.getElementById('totalUsers').textContent = stats.totalUsers;
            document.getElementById('totalGames').textContent = stats.totalGames;
            document.getElementById('totalCities').textContent = stats.totalCities;
            document.getElementById('totalClubs').textContent = stats.totalClubs;
            document.getElementById('activeGames').textContent = stats.activeGames;
            document.getElementById('totalInvites').textContent = stats.totalInvites || 0;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

const ONLINE_USERS_POLL_MS = 3000;

function startOnlineUsersPoll() {
    if (onlineUsersPollInterval) return;
    onlineUsersPollInterval = setInterval(loadOnlineUsers, ONLINE_USERS_POLL_MS);
}

async function loadOnlineUsers() {
    const countEl = document.getElementById('onlineUsersCount');
    const updatedEl = document.getElementById('onlineUsersUpdated');
    const tbody = document.getElementById('onlineUsersTableBody');
    if (!countEl || !updatedEl || !tbody) return;
    try {
        const response = await apiRequest('/admin/online-users');
        if (!response.success) return;
        const users = response.data || [];
        countEl.textContent = `${users.length} online`;
        updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${escapeHtmlAttr(getUserName(u))}</td>
                <td>${escapeHtmlAttr(u.phone || '-')}</td>
                <td>${escapeHtmlAttr(u.currentCity?.name || '-')}</td>
                <td>${u.level ?? '-'}</td>
                <td>${authLabels[u.authProvider] || u.authProvider || '-'}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Failed to load online users:', error);
        countEl.textContent = 'Error';
        updatedEl.textContent = '';
    }
}

async function loadPageData(page) {
    switch (page) {
        case 'overview':
            loadStats();
            break;
        case 'users':
            loadUsers();
            break;
        case 'online-users':
            loadOnlineUsers();
            startOnlineUsersPoll();
            break;
        case 'games':
            loadGames();
            break;
        case 'invites':
            loadInvites();
            break;
        case 'cities':
            loadCities();
            break;
        case 'clubs':
            backToCenters();
            loadClubs();
            break;
        case 'reports':
            loadMessageReports();
            break;
        case 'app-versions':
            loadAppVersions();
            break;
        case 'market-categories':
            loadMarketCategories();
            break;
        case 'mass-notifications':
            loadMassNotificationsPage();
            break;
        case 'logs':
            if (!isStreamActive) {
                if (logsData.length === 0) {
                    loadHistoricalLogs().then(() => {
                        startLogStream();
                    });
                } else {
                    startLogStream();
                }
            }
            break;
    }
}

function escapeHtmlAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const authLabels = { PHONE: 'PH', TELEGRAM: 'TG', APPLE: 'AP', GOOGLE: 'GG' };
const getUserName = (u) => ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.phone || '-';

function initUsersDataTable() {
    usersDataTable = new DataTable({
        container: 'usersDataTable',
        columns: [
            { key: 'avatar', label: '', sortable: false },
            { key: 'name', label: 'Name', accessor: (u) => getUserName(u) },
            { key: 'phone', label: 'Phone' },
            { key: 'auth', label: 'Auth', accessor: (u) => authLabels[u.authProvider] || u.authProvider },
            { key: 'city', label: 'City', accessor: (u) => u.currentCity?.name },
            { key: 'level', label: 'Level', accessor: (u) => u.level ?? 0 },
            { key: 'games', label: 'Games', accessor: (u) => u.gamesPlayed ?? 0 },
            { key: 'wallet', label: 'Wallet', accessor: (u) => u.wallet ?? 0 },
            { key: 'status', label: 'Status', accessor: (u) => u.isActive ? 'Active' : 'Inactive' },
            { key: 'roles', label: 'Roles', sortable: false },
            { key: 'actions', label: 'Actions', sortable: false },
        ],
        filters: [
            { id: 'usersSearch', type: 'search', param: 'search', placeholder: 'Search name, phone, email...' },
        ],
        getExtraParams: () => (selectedCityId ? { cityId: selectedCityId } : {}),
        extraButtons: [
            { action: 'dropCoins', label: '💰 Drop Coins', className: 'btn-success', onClick: () => dropCoinsModal() },
            { action: 'addUser', label: '+ Add User', className: 'btn-primary', onClick: () => createUserModal() },
        ],
        fetchFn: async (params) => {
            const qs = new URLSearchParams(params).toString();
            const response = await apiRequest(`/admin/users${qs ? '?' + qs : ''}`);
            if (!response.success) throw new Error(response.message || 'Failed');
            window.__pageUsers = response.data;
            window.usersCurrentPage = response.pagination?.page ?? 1;
            return { data: response.data, pagination: response.pagination };
        },
        renderRow: (user) => {
            const name = getUserName(user);
            const authBadge = authLabels[user.authProvider] || user.authProvider || '-';
            const cityName = user.currentCity?.name || '-';
            const roles = [];
            if (user.isAdmin) roles.push('Admin');
            if (user.isTrainer) roles.push('Trainer');
            if (user.canCreateTournament) roles.push('Tournament');
            if (user.canCreateLeague) roles.push('League');
            const rolesStr = roles.length ? roles.join(', ') : '-';
            const avatarSrc = user.avatar || '';
            const initials = (user.firstName?.[0] || '') + (user.lastName?.[0] || '') || '?';
            const canResetPassword = user.authProvider === 'PHONE';
            return `<tr>
                <td><div class="user-avatar" title="${escapeHtmlAttr(name)}">${avatarSrc ? `<img src="${escapeHtmlAttr(avatarSrc)}" alt="" onerror="this.parentElement.innerHTML='<span>${escapeHtmlAttr(initials)}</span>'">` : `<span>${escapeHtmlAttr(initials)}</span>`}</div></td>
                <td>${escapeHtml(name || '')}</td>
                <td>${escapeHtml(user.phone || '-')}</td>
                <td><span class="badge badge-secondary">${escapeHtml(authBadge)}</span></td>
                <td>${escapeHtml(cityName)}</td>
                <td>${(user.level ?? 0).toFixed(1)}</td>
                <td>${user.gamesPlayed ?? 0}</td>
                <td>${user.wallet ?? 0}</td>
                <td><span class="badge ${user.isActive ? 'badge-success' : 'badge-danger'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>${escapeHtml(rolesStr || '')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit" onclick="viewUserDetail('${user.id}')">View</button>
                        <button class="btn-small btn-edit" onclick="editUserById('${user.id}')">Edit</button>
                        <button class="btn-small btn-toggle" onclick="toggleUserStatus('${user.id}')">${user.isActive ? 'Deactivate' : 'Activate'}</button>
                        ${canResetPassword ? `<button class="btn-small btn-warning" onclick="resetPasswordModal('${user.id}', '${escapeHtmlAttr(name)}')">Reset Pwd</button>` : ''}
                        <button class="btn-small btn-success" onclick="emitCoinsModal('${user.id}', '${escapeHtmlAttr(name)}')">Coins</button>
                        ${!user.isAdmin ? `<button class="btn-small btn-delete" onclick="deleteUser('${user.id}', '${escapeHtmlAttr(name)}')">Delete</button>` : ''}
                    </div>
                </td>
            </tr>`;
        },
        emptyMessage: 'No users found.',
    });
}

function loadUsers(page = 1) {
    if (!usersDataTable) initUsersDataTable();
    usersDataTable.fetch(page);
}

function editUserById(userId) {
    const user = window.__pageUsers?.find(u => u.id === userId);
    if (user) editUserModal(user);
}

function viewUserDetail(userId) {
    const user = window.__pageUsers?.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('userDetailModalTitle').textContent = `User: ${(user.firstName || '') + ' ' + (user.lastName || '')}`.trim() || user.phone;
    const authLabels = { PHONE: 'Phone', TELEGRAM: 'Telegram', APPLE: 'Apple', GOOGLE: 'Google' };
    document.getElementById('userDetailContent').innerHTML = `
        <div class="user-detail-grid">
            <div class="form-group"><label>Auth</label><div class="form-readonly">${authLabels[user.authProvider] || user.authProvider}</div></div>
            <div class="form-group"><label>Phone</label><div class="form-readonly">${user.phone || '-'}</div></div>
            <div class="form-group"><label>Email</label><div class="form-readonly">${user.email || '-'}</div></div>
            <div class="form-group"><label>City</label><div class="form-readonly">${user.currentCity?.name || '-'}</div></div>
            <div class="form-group"><label>Level</label><div class="form-readonly">${(user.level ?? 0).toFixed(1)}</div></div>
            <div class="form-group"><label>Games</label><div class="form-readonly">${user.gamesPlayed ?? 0} played, ${user.gamesWon ?? 0} won</div></div>
            <div class="form-group"><label>Wallet</label><div class="form-readonly">${user.wallet ?? 0}</div></div>
            <div class="form-group"><label>Created</label><div class="form-readonly">${formatDate(user.createdAt)}</div></div>
        </div>
    `;
    openModal('userDetailModal');
}

async function deleteUser(userId, userName) {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    try {
        await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
        loadUsers(usersDataTable?.currentPage ?? 1);
    } catch (error) {
        alert('Error: ' + (error.message || 'Failed to delete'));
    }
}

async function toggleUserStatus(userId) {
    try {
        await apiRequest(`/admin/users/${userId}/toggle-status`, {
            method: 'PATCH',
        });
        loadUsers();
    } catch (error) {
        console.error('Failed to toggle user status:', error);
    }
}

function getEntityLabel(entityType, gameType) {
    if (entityType === 'BAR') return '🍺 BAR';
    if (entityType === 'TRAINING') return '🎓 TRAINING';
    if (entityType === 'TOURNAMENT') return '🏆 Tournament';
    if (entityType === 'LEAGUE' || entityType === 'LEAGUE_SEASON') return '📋 League';
    return gameType || entityType || '-';
}

function initGamesDataTable() {
    gamesDataTable = new DataTable({
        container: 'gamesDataTable',
        columns: [
            { key: 'name', label: 'Name' },
            { key: 'organizer', label: 'Organizer' },
            { key: 'type', label: 'Type' },
            { key: 'location', label: 'Location' },
            { key: 'startTime', label: 'Start Time', accessor: (g) => new Date(g.startTime).getTime() },
            { key: 'participants', label: 'Participants' },
            { key: 'status', label: 'Status' },
            { key: 'results', label: 'Results' },
            { key: 'actions', label: 'Actions', sortable: false },
        ],
        filters: [
            { id: 'gamesSearch', type: 'search', param: 'search', placeholder: 'Search name, club, organizer...' },
            { id: 'gamesStatusFilter', type: 'select', param: 'status', placeholder: 'All Status', options: [
                { value: 'ANNOUNCED', label: 'Announced' },
                { value: 'STARTED', label: 'Started' },
                { value: 'FINISHED', label: 'Finished' },
                { value: 'ARCHIVED', label: 'Archived' },
            ]},
            { id: 'gamesEntityFilter', type: 'select', param: 'entityType', placeholder: 'All Types', options: [
                { value: 'GAME', label: 'Game' },
                { value: 'BAR', label: 'Bar' },
                { value: 'TRAINING', label: 'Training' },
                { value: 'TOURNAMENT', label: 'Tournament' },
                { value: 'LEAGUE', label: 'League' },
                { value: 'LEAGUE_SEASON', label: 'League Season' },
            ]},
            { id: 'gamesResultsFilter', type: 'select', param: 'hasResults', placeholder: 'All', options: [
                { value: 'true', label: 'Has Results' },
                { value: 'false', label: 'No Results' },
            ]},
            { id: 'gamesStartDate', type: 'date', param: 'startDate' },
            { id: 'gamesEndDate', type: 'date', param: 'endDate' },
        ],
        getExtraParams: () => (selectedCityId ? { cityId: selectedCityId } : {}),
        fetchFn: async (params) => {
            const qs = new URLSearchParams(params).toString();
            const response = await apiRequest(`/admin/games${qs ? '?' + qs : ''}`);
            if (!response.success) throw new Error(response.message || 'Failed');
            return { data: response.data, pagination: response.pagination };
        },
        renderRow: (game) => {
            const location = game.court ? `${game.court.club.name}, ${game.court.club.city.name}` : game.club?.name || game.city?.name || 'No location';
            const parts = game.participants || [];
            const playing = parts.filter(p => p.status === 'PLAYING').length;
            const invited = parts.filter(p => p.status === 'INVITED').length;
            const inQueue = parts.filter(p => p.status === 'IN_QUEUE').length;
            const partsStr = invited || inQueue ? `${playing}/${invited}/${inQueue}` : parts.length;
            const name = game.name || `Game ${game.gameType}`;
            const organizer = getGameOrganizer(game);
            const getStatusBadgeClass = (s) => ({ ANNOUNCED: 'badge-announced', READY: 'badge-ready', STARTED: 'badge-started', FINISHED: 'badge-finished', ARCHIVED: 'badge-archived' }[s] || 'badge-info');
            return `<tr>
                <td title="${escapeHtmlAttr(game.description || '')}">${escapeHtml(name)}</td>
                <td>${escapeHtml(organizer)}</td>
                <td><span class="badge ${game.entityType === 'BAR' ? 'badge-warning' : 'badge-info'}">${escapeHtml(getEntityLabel(game.entityType, game.gameType))}</span></td>
                <td>${escapeHtml(location)}</td>
                <td>${formatDate(game.startTime)}</td>
                <td title="${invited || inQueue ? 'playing/invited/queue' : 'participants'}">${partsStr}</td>
                <td><span class="badge ${getStatusBadgeClass(game.status)}">${escapeHtml(game.status)}</span></td>
                <td><span class="badge ${game.resultsStatus !== 'NONE' ? 'badge-success' : 'badge-danger'}">${game.resultsStatus !== 'NONE' ? 'Yes' : 'No'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit" onclick="viewGameModal('${game.id}')">View</button>
                        ${game.resultsStatus !== 'NONE' ? `<button class="btn-small btn-warning" onclick="resetGameResults('${game.id}')">Reset Results</button>` : ''}
                    </div>
                </td>
            </tr>`;
        },
        emptyMessage: 'No games found.',
    });
}

function loadGames(page = 1) {
    if (!gamesDataTable) initGamesDataTable();
    gamesDataTable.fetch(page);
}

async function resetGameResults(gameId) {
    if (!confirm('Are you sure you want to reset the results for this game? This action cannot be undone.')) {
        return;
    }
    try {
        await apiRequest(`/admin/games/${gameId}/reset-results`, { method: 'POST' });
        toast('Game results reset successfully', 'success');
        loadGames(gamesDataTable?.currentPage ?? 1);
        loadStats();
    } catch (error) {
        console.error('Failed to reset game results:', error);
        toast('Failed to reset game results: ' + (error.message || 'Unknown error'), 'error');
    }
}

function getGameOrganizer(game) {
    const owner = game.participants?.find(p => p.role === 'OWNER');
    if (!owner?.user) return '-';
    const u = owner.user;
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    return name || u.phone || '-';
}

async function loadCities() {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            renderCitiesTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
    }
}

function renderCitiesTable(cities) {
    const tbody = document.getElementById('citiesTableBody');
    tbody.innerHTML = cities.map(city => `
        <tr>
            <td>${city.name}</td>
            <td>${city.country}</td>
            <td>${city.timezone}</td>
            <td>${city._count.clubs}</td>
            <td>${city._count.users}</td>
            <td>
                <span class="badge ${city.isActive ? 'badge-success' : 'badge-danger'}">
                    ${city.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editCityModal(${JSON.stringify(city)})'>Edit</button>
                    <button class="btn-small btn-secondary" onclick="recalculateCityCenter('${city.id}')">Recalc center</button>
                    <button class="btn-small btn-delete" onclick="deleteCity('${city.id}', '${city.name}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function recalculateCityCenter(cityId) {
    try {
        await apiRequest(`/admin/cities/${cityId}/recalculate-center`, { method: 'POST' });
        alert('Center recalculated');
        loadCities();
    } catch (error) {
        alert('Error: ' + (error.message || 'Failed to recalculate'));
    }
}

async function recalculateAllCitiesCenter() {
    if (!confirm('Recalculate centroid for all cities?')) return;
    try {
        const response = await apiRequest('/admin/cities/recalculate-all-centers', { method: 'POST' });
        alert(`Updated ${response.data?.updated ?? 0} cities`);
        loadCities();
    } catch (error) {
        alert('Error: ' + (error.message || 'Failed to recalculate'));
    }
}

async function loadClubs() {
    const errorDiv = document.getElementById('clubsError');
    const loadingDiv = document.getElementById('clubsLoading');
    const retryDiv = document.getElementById('clubsRetry');

    errorDiv.textContent = ''; // Clear previous errors
    retryDiv.style.display = 'none'; // Hide retry button
    loadingDiv.style.display = 'block'; // Show loading

    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/clubs${queryParams}`);
        if (response.success) {
            renderClubsTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load clubs:', error);
        errorDiv.textContent = error.message || 'Failed to load clubs. Please try again.';
        retryDiv.style.display = 'block'; // Show retry button on error
    } finally {
        loadingDiv.style.display = 'none'; // Hide loading
    }
}

function renderClubsTable(centers) {
    const tbody = document.getElementById('centersTableBody');
    tbody.innerHTML = centers.map(center => `
        <tr>
            <td>${center.name}</td>
            <td>${center.city.name}</td>
            <td>${center.address}</td>
            <td>
                <button class="btn-small btn-edit" onclick='viewCenterCourts(${JSON.stringify(center)})'>
                    ${center._count.courts} Courts
                </button>
            </td>
            <td>${center.phone || '-'}</td>
            <td>
                <span class="badge ${center.isActive ? 'badge-success' : 'badge-danger'}">
                    ${center.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editCenterModal(${JSON.stringify(center)})'>Edit</button>
                    <button class="btn-small btn-delete" onclick="deleteClub('${center.id}', '${center.name}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

let currentCenter = null;

function viewCenterCourts(center) {
    currentCenter = center;
    document.getElementById('centersList').style.display = 'none';
    document.getElementById('courtsView').style.display = 'block';
    document.getElementById('centerName').textContent = center.name;
    document.getElementById('centerLocation').textContent = `${center.address}, ${center.city.name}`;
    loadCourtsForCenter(center.id);
}

function backToCenters() {
    currentCenter = null;
    document.getElementById('centersList').style.display = 'block';
    document.getElementById('courtsView').style.display = 'none';
}

async function loadCourtsForCenter(centerId) {
    try {
        const response = await apiRequest(`/admin/courts?centerId=${centerId}`);
        if (response.success) {
            renderCourtsTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load courts:', error);
    }
}

function renderCourtsTable(courts) {
    const tbody = document.getElementById('courtsTableBody');
    if (courts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No courts found. Add a court to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = courts.map(court => `
        <tr>
            <td>${court.name}</td>
            <td>${court.courtType || '-'}</td>
            <td>
                <span class="badge ${court.isIndoor ? 'badge-info' : 'badge-warning'}">
                    ${court.isIndoor ? 'Indoor' : 'Outdoor'}
                </span>
            </td>
            <td>${court.surfaceType || '-'}</td>
            <td>${court.pricePerHour ? '$' + court.pricePerHour : '-'}</td>
            <td>
                <span class="badge ${court.isActive ? 'badge-success' : 'badge-danger'}">
                    ${court.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editCourtModal(${JSON.stringify(court)})'>Edit</button>
                    <button class="btn-small btn-delete" onclick="deleteCourt('${court.id}', '${court.name}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

let eventSource = null;
let isStreamActive = false;
let logsData = [];

async function loadHistoricalLogs() {
    try {
        const response = await apiRequest('/logs/historical?limit=500');
        if (response.success) {
            logsData = response.data;
            renderLogs();
            updateLogsStatus('📋 Historical logs loaded', logsData.length);
        }
    } catch (error) {
        console.error('Failed to load historical logs:', error);
        updateLogsStatus('❌ Failed to load logs', 0);
    }
}

function toggleLogStream() {
    if (isStreamActive) {
        stopLogStream();
    } else {
        startLogStream();
    }
}

function startLogStream() {
    if (eventSource) {
        eventSource.close();
    }

    const url = `${API_URL}/logs/stream?token=${authToken}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
        console.log('Log stream connected');
        isStreamActive = true;
        updateLogsStatus('🟢 Streaming...', logsData.length);
    };

    eventSource.onmessage = (event) => {
        try {
            const log = JSON.parse(event.data);
            logsData.push(log);
            
            if (logsData.length > 500) {
                logsData.shift();
            }
            
            addLogToOutput(log);
            updateLogsStatus('🟢 Streaming...', logsData.length);
        } catch (error) {
            console.error('Error parsing log:', error, event.data);
        }
    };

    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        if (eventSource.readyState === EventSource.CLOSED) {
            updateLogsStatus('🔴 Connection closed', logsData.length);
            stopLogStream();
        } else if (eventSource.readyState === EventSource.CONNECTING) {
            updateLogsStatus('🟡 Reconnecting...', logsData.length);
        }
    };

    isStreamActive = true;
    document.getElementById('toggleStreamBtn').textContent = 'Stop Stream';
    document.getElementById('toggleStreamBtn').classList.remove('btn-primary');
    document.getElementById('toggleStreamBtn').classList.add('btn-danger');
    updateLogsStatus('🟡 Connecting...', logsData.length);
}

function stopLogStream() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    isStreamActive = false;
    document.getElementById('toggleStreamBtn').textContent = 'Start Stream';
    document.getElementById('toggleStreamBtn').classList.remove('btn-danger');
    document.getElementById('toggleStreamBtn').classList.add('btn-primary');
    updateLogsStatus('⏸️ Stream stopped', logsData.length);
}

async function clearLogs() {
    if (!confirm('Are you sure you want to clear all logs?')) {
        return;
    }

    try {
        await apiRequest('/logs/clear', { method: 'DELETE' });
        logsData = [];
        renderLogs();
        updateLogsStatus('🗑️ Logs cleared', 0);
    } catch (error) {
        console.error('Failed to clear logs:', error);
    }
}

function renderLogs() {
    const output = document.getElementById('logsOutput');
    output.innerHTML = logsData.map(log => formatLogEntry(log)).join('');
    output.scrollTop = output.scrollHeight;
}

function addLogToOutput(log) {
    const output = document.getElementById('logsOutput');
    const timestamp = formatLogTimestamp(log.timestamp);
    const levelClass = `log-level-${log.level}`;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${levelClass}`;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-timestamp';
    timestampSpan.textContent = timestamp;
    
    const levelSpan = document.createElement('span');
    levelSpan.className = 'log-level';
    levelSpan.textContent = log.level.toUpperCase();
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = log.message;
    
    logEntry.appendChild(timestampSpan);
    logEntry.appendChild(levelSpan);
    logEntry.appendChild(messageSpan);
    
    output.appendChild(logEntry);
    output.scrollTop = output.scrollHeight;
}

function formatLogTimestamp(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

function formatLogEntry(log) {
    const timestamp = formatLogTimestamp(log.timestamp);
    const levelClass = `log-level-${log.level}`;
    return `
        <div class="log-entry ${levelClass}">
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level">${log.level.toUpperCase()}</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
    `;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function updateLogsStatus(status, count) {
    document.getElementById('logsStatus').textContent = status;
    document.getElementById('logsCount').textContent = `${count} logs`;
}

async function viewGameModal(gameId) {
    document.getElementById('gameModal').style.display = 'flex';
    const content = document.getElementById('gameModalContent');
    const origContent = content.innerHTML;
    content.innerHTML = '<div class="game-modal-loading">Loading...</div>';
    try {
        const response = await apiRequest(`/admin/games/${gameId}`);
        if (!response.success || !response.data) throw new Error('Failed to load game');
        content.innerHTML = origContent;
        populateGameModal(response.data);
    } catch (error) {
        console.error('Failed to load game:', error);
        content.innerHTML = `<div class="game-modal-error">${escapeHtml(error.message || 'Failed to load game')}</div>`;
        toast('Failed to load game details', 'error');
    }
}

function populateGameModal(game) {
    document.getElementById('gameModalTitle').textContent = game.name || `Game - ${game.gameType}`;

    document.getElementById('gameEntityType').textContent = game.entityType || '-';
    document.getElementById('gameGameType').textContent = game.gameType || '-';
    document.getElementById('gameName').textContent = game.name || '-';
    document.getElementById('gameDescription').textContent = game.description || '-';
    document.getElementById('gameStartTime').textContent = formatDate(game.startTime);
    document.getElementById('gameEndTime').textContent = formatDate(game.endTime);
    document.getElementById('gameMinParticipants').textContent = game.minParticipants ?? '-';
    document.getElementById('gameMaxParticipants').textContent = game.maxParticipants ?? '-';
    document.getElementById('gameLevel').textContent = (game.minLevel != null && game.maxLevel != null)
        ? `${game.minLevel.toFixed(1)} - ${game.maxLevel.toFixed(1)}` : '-';

    const clubName = game.court?.club?.name || game.club?.name || '-';
    const courtName = game.court?.name || '-';
    const cityName = game.court?.club?.city?.name || game.city?.name || '-';
    document.getElementById('gameClub').textContent = clubName;
    document.getElementById('gameCourt').textContent = courtName;
    const cityEl = document.getElementById('gameCity');
    if (cityEl) cityEl.textContent = cityName;
    const orgEl = document.getElementById('gameOrganizer');
    if (orgEl) orgEl.textContent = getGameOrganizer(game);

    document.getElementById('gameStatus').textContent = game.status || '-';
    document.getElementById('gameHasResults').textContent = game.resultsStatus !== 'NONE' ? 'Yes' : 'No';
    document.getElementById('gameIsPublic').textContent = game.isPublic ? 'Yes' : 'No';
    document.getElementById('gameAffectsRating').textContent = game.affectsRating ? 'Yes' : 'No';
    document.getElementById('gameAnyoneCanInvite').textContent = game.anyoneCanInvite ? 'Yes' : 'No';
    document.getElementById('gameResultsByAnyone').textContent = game.resultsByAnyone ? 'Yes' : 'No';
    document.getElementById('gameHasBookedCourt').textContent = game.hasBookedCourt ? 'Yes' : 'No';

    const parts = game.participants || [];
    const playing = parts.filter(p => p.status === 'PLAYING').length;
    const invited = parts.filter(p => p.status === 'INVITED').length;
    const inQueue = parts.filter(p => p.status === 'IN_QUEUE').length;
    const countStr = invited || inQueue
        ? `${playing} playing, ${invited} invited, ${inQueue} in queue (${parts.length} total) / ${game.maxParticipants || 0}`
        : `${parts.length} / ${game.maxParticipants || 0}`;
    document.getElementById('gameParticipantsCount').textContent = countStr;

    const participantsList = document.getElementById('gameParticipantsList');
    if (game.participants && game.participants.length > 0) {
        const statusBadge = (s) => {
            const c = { PLAYING: 'badge-success', INVITED: 'badge-warning', IN_QUEUE: 'badge-info', GUEST: 'badge-secondary' }[s] || 'badge-secondary';
            return `<span class="badge ${c}">${(s || '-').replace('_', ' ')}</span>`;
        };
        participantsList.innerHTML = game.participants.map(p => {
            const name = `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || p.user.phone || '-';
            return `
            <div class="participant-item">
                <div class="participant-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span class="participant-role">(${p.role})</span>
                    ${statusBadge(p.status)}
                </div>
                <div class="participant-details">
                    <span class="participant-level">Level: ${(p.user.level ?? 0).toFixed(1)}</span>
                    <span class="participant-joined">Joined: ${formatDate(p.joinedAt)}</span>
                </div>
            </div>
        `;
        }).join('');
    } else {
        participantsList.innerHTML = '<p>No participants</p>';
    }

    document.getElementById('gameCreatedAt').textContent = formatDate(game.createdAt);
}

async function loadInvites() {
    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/invites${queryParams}`);
        if (response.success) {
            currentInvites = response.data;
            renderInvitesTable(currentInvites);
        }
    } catch (error) {
        console.error('Failed to load invites:', error);
    }
}

function renderInvitesTable(invites) {
    const tbody = document.getElementById('invitesTableBody');
    if (invites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No pending invites found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = invites.map(invite => {
        const gameName = invite.game?.name || 'Unknown Game';
        const gameType = invite.game?.gameType || '-';
        const senderName = invite.sender
            ? `${invite.sender.firstName || ''} ${invite.sender.lastName || ''}`.trim() || invite.sender.phone || 'Unknown'
            : '-';
        const receiverName = invite.receiver
            ? `${invite.receiver.firstName || ''} ${invite.receiver.lastName || ''}`.trim() || invite.receiver.phone || 'Unknown'
            : 'Unknown';
        const location = invite.game?.court ? 
            `${invite.game.court.club.name}, ${invite.game.court.club.city.name}` : 
            'No location';
        const startTime = invite.game?.startTime ? formatDate(invite.game.startTime) : '-';
        const message = invite.message || '-';
        const createdAt = formatDate(invite.createdAt);
        
        return `
            <tr>
                <td>
                    <div class="game-info">
                        <strong>${gameName}</strong>
                        <span class="badge badge-info">${gameType}</span>
                    </div>
                </td>
                <td>
                    <div class="user-info">
                        <strong>${senderName}</strong>
                        ${invite.sender?.level ? `<span class="level">Level ${invite.sender.level.toFixed(1)}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div class="user-info">
                        <strong>${receiverName}</strong>
                        ${invite.receiver?.level ? `<span class="level">Level ${invite.receiver.level.toFixed(1)}</span>` : ''}
                    </div>
                </td>
                <td>${location}</td>
                <td>${startTime}</td>
                <td class="message-cell">${message}</td>
                <td>${createdAt}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-success" onclick="acceptInvite('${invite.id}')">Accept</button>
                        <button class="btn-small btn-danger" onclick="declineInvite('${invite.id}')">Decline</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function acceptInvite(inviteId) {
    if (!confirm('Are you sure you want to accept this invite?')) {
        return;
    }
    
    try {
        await apiRequest(`/admin/invites/${inviteId}/accept`, {
            method: 'POST',
        });
        loadInvites();
    } catch (error) {
        console.error('Failed to accept invite:', error);
        alert('Failed to accept invite: ' + (error.message || 'Unknown error'));
    }
}

async function declineInvite(inviteId) {
    if (!confirm('Are you sure you want to decline this invite?')) {
        return;
    }
    
    try {
        await apiRequest(`/admin/invites/${inviteId}/decline`, {
            method: 'POST',
        });
        loadInvites();
    } catch (error) {
        console.error('Failed to decline invite:', error);
        alert('Failed to decline invite: ' + (error.message || 'Unknown error'));
    }
}

function refreshInvites() {
    loadInvites();
}

async function acceptAllInvites() {
    const pendingInvites = currentInvites.filter(invite => invite.status === 'PENDING');

    if (pendingInvites.length === 0) {
        alert('No pending invites to accept.');
        return;
    }

    if (!confirm(`Are you sure you want to accept all ${pendingInvites.length} pending invite(s)?`)) {
        return;
    }

    const acceptBtn = document.querySelector('.btn-accept-all');
    if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Accepting...';
    }

    let successCount = 0;
    let failCount = 0;

    for (const invite of pendingInvites) {
        try {
            await apiRequest(`/admin/invites/${invite.id}/accept`, {
                method: 'POST',
            });
            successCount++;
        } catch (error) {
            console.error(`Failed to accept invite ${invite.id}:`, error);
            failCount++;
        }
    }

    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = 'Accept ALL';
    }

    if (failCount > 0) {
        alert(`Accepted ${successCount} invite(s). Failed to accept ${failCount} invite(s).`);
    } else {
        alert(`Successfully accepted ${successCount} invite(s).`);
    }

    loadInvites();
    loadStats();
}

window.toggleUserStatus = toggleUserStatus;
window.editUserById = editUserById;
window.viewUserDetail = viewUserDetail;
window.deleteUser = deleteUser;
window.loadCities = loadCities;
window.loadClubs = loadClubs;
window.viewCenterCourts = viewCenterCourts;
window.backToCenters = backToCenters;
window.handleGlobalCityChange = handleGlobalCityChange;
window.loadHistoricalLogs = loadHistoricalLogs;
window.toggleLogStream = toggleLogStream;
window.clearLogs = clearLogs;
window.viewGameModal = viewGameModal;
window.resetGameResults = resetGameResults;
window.acceptInvite = acceptInvite;
window.declineInvite = declineInvite;
window.refreshInvites = refreshInvites;
window.acceptAllInvites = acceptAllInvites;

let reportStatusFilter = '';

function handleReportStatusFilter() {
    reportStatusFilter = document.getElementById('reportStatusFilter').value;
    loadMessageReports();
}

async function loadMessageReports() {
    try {
        const queryParams = reportStatusFilter ? `?status=${reportStatusFilter}` : '';
        const response = await apiRequest(`/admin/message-reports${queryParams}`);
        if (response.success) {
            renderReportsTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load message reports:', error);
    }
}

function renderReportsTable(reports) {
    const tbody = document.getElementById('reportsTableBody');
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No reported messages found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = reports.map(report => {
        const reporterName = `${report.reporter?.firstName || ''} ${report.reporter?.lastName || ''}`.trim() || report.reporter?.phone || 'Unknown';
        const senderName = report.message?.sender ? 
            `${report.message.sender.firstName || ''} ${report.message.sender.lastName || ''}`.trim() || report.message.sender.phone || 'Unknown' :
            'System';
        const messageContent = report.message?.content || '[Media message]';
        const reasonLabels = {
            'SPAM': 'Spam',
            'HARASSMENT': 'Harassment',
            'INAPPROPRIATE_CONTENT': 'Inappropriate Content',
            'FAKE_INFORMATION': 'Fake Information',
            'OTHER': 'Other'
        };
        const statusLabels = {
            'PENDING': 'Pending',
            'REVIEWED': 'Reviewed',
            'RESOLVED': 'Resolved',
            'DISMISSED': 'Dismissed'
        };
        const statusBadges = {
            'PENDING': 'badge-warning',
            'REVIEWED': 'badge-info',
            'RESOLVED': 'badge-success',
            'DISMISSED': 'badge-secondary'
        };
        
        return `
            <tr>
                <td>${formatDate(report.createdAt)}</td>
                <td>${reporterName}</td>
                <td>${senderName}</td>
                <td class="message-cell" style="max-width: 300px; word-wrap: break-word;">${messageContent}</td>
                <td>${reasonLabels[report.reason] || report.reason}</td>
                <td class="message-cell" style="max-width: 200px; word-wrap: break-word;">${report.description || '-'}</td>
                <td>
                    <span class="badge ${statusBadges[report.status] || 'badge-secondary'}">
                        ${statusLabels[report.status] || report.status}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        ${report.status === 'PENDING' ? `
                            <button class="btn-small btn-success" onclick="updateReportStatus('${report.id}', 'REVIEWED')">Review</button>
                            <button class="btn-small btn-info" onclick="updateReportStatus('${report.id}', 'RESOLVED')">Resolve</button>
                            <button class="btn-small btn-secondary" onclick="updateReportStatus('${report.id}', 'DISMISSED')">Dismiss</button>
                        ` : ''}
                        ${report.status === 'REVIEWED' ? `
                            <button class="btn-small btn-info" onclick="updateReportStatus('${report.id}', 'RESOLVED')">Resolve</button>
                            <button class="btn-small btn-secondary" onclick="updateReportStatus('${report.id}', 'DISMISSED')">Dismiss</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function updateReportStatus(reportId, status) {
    if (!confirm(`Are you sure you want to update this report status to ${status}?`)) {
        return;
    }
    
    try {
        await apiRequest(`/admin/message-reports/${reportId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
        loadMessageReports();
    } catch (error) {
        console.error('Failed to update report status:', error);
        alert('Failed to update report status: ' + (error.message || 'Unknown error'));
    }
}

window.handleReportStatusFilter = handleReportStatusFilter;
window.loadMessageReports = loadMessageReports;
window.updateReportStatus = updateReportStatus;

document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('adminToken');
    const savedAdmin = localStorage.getItem('adminData');
    const savedApiUrl = localStorage.getItem('apiUrl');

    if (savedApiUrl) {
        document.getElementById('apiUrl').value = savedApiUrl;
    }

    if (savedToken && savedAdmin) {
        authToken = savedToken;
        showDashboard(JSON.parse(savedAdmin));
    }

    document.querySelectorAll('.stat-card.clickable').forEach(card => {
        card.addEventListener('click', () => {
            const page = card.dataset.page;
            switchPage(page);
        });
    });

});

window.addEventListener('beforeunload', () => {
    if (eventSource) {
        eventSource.close();
    }
});

async function loadAppVersions() {
    try {
        const response = await apiRequest('/admin/app-versions');
        if (response.success) {
            renderAppVersionsTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load app versions:', error);
    }
}

function renderAppVersionsTable(versions) {
    const tbody = document.getElementById('appVersionsTableBody');
    if (versions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No version requirements configured</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    versions.forEach(version => {
        const row = document.createElement('tr');
        
        const platformCell = document.createElement('td');
        platformCell.textContent = version.platform.toUpperCase();
        row.appendChild(platformCell);
        
        const buildCell = document.createElement('td');
        buildCell.textContent = version.minBuildNumber;
        row.appendChild(buildCell);
        
        const versionCell = document.createElement('td');
        versionCell.textContent = version.minVersion;
        row.appendChild(versionCell);
        
        const blockingCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = version.isBlocking ? 'badge badge-danger' : 'badge badge-warning';
        badge.textContent = version.isBlocking ? 'Blocking' : 'Optional';
        blockingCell.appendChild(badge);
        row.appendChild(blockingCell);
        
        const messageCell = document.createElement('td');
        messageCell.textContent = version.message || '-';
        row.appendChild(messageCell);
        
        const dateCell = document.createElement('td');
        dateCell.textContent = formatDate(version.updatedAt);
        row.appendChild(dateCell);
        
        const actionsCell = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-secondary';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => editAppVersion(version.platform, version.minBuildNumber, version.minVersion, version.isBlocking, version.message || '');
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteAppVersion(version.platform);
        
        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(document.createTextNode(' '));
        actionsCell.appendChild(deleteBtn);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
    });
}

function createAppVersionModal() {
    document.getElementById('appVersionModalTitle').textContent = 'Add Version Requirement';
    document.getElementById('appVersionForm').reset();
    document.getElementById('versionPlatform').disabled = false;
    openModal('appVersionModal');
}

function editAppVersion(platform, minBuildNumber, minVersion, isBlocking, message) {
    document.getElementById('appVersionModalTitle').textContent = 'Edit Version Requirement';
    document.getElementById('versionPlatform').value = platform;
    document.getElementById('versionPlatform').disabled = true;
    document.getElementById('versionMinBuildNumber').value = minBuildNumber;
    document.getElementById('versionMinVersion').value = minVersion;
    document.getElementById('versionIsBlocking').checked = isBlocking;
    document.getElementById('versionMessage').value = message !== 'null' ? message : '';
    openModal('appVersionModal');
}

async function deleteAppVersion(platform) {
    if (!confirm(`Are you sure you want to delete the ${platform.toUpperCase()} version requirement?`)) {
        return;
    }

    try {
        const response = await apiRequest(`/admin/app-versions/${platform}`, {
            method: 'DELETE',
        });

        if (response.success) {
            alert('Version requirement deleted successfully');
            loadAppVersions();
        }
    } catch (error) {
        alert(error.message || 'Failed to delete version requirement');
    }
}

document.getElementById('appVersionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const platform = document.getElementById('versionPlatform').value;
    const minBuildNumber = parseInt(document.getElementById('versionMinBuildNumber').value);
    const minVersion = document.getElementById('versionMinVersion').value;
    const isBlocking = document.getElementById('versionIsBlocking').checked;
    const message = document.getElementById('versionMessage').value || null;

    try {
        const response = await apiRequest('/admin/app-versions', {
            method: 'POST',
            body: JSON.stringify({
                platform,
                minBuildNumber,
                minVersion,
                isBlocking,
                message,
            }),
        });

        if (response.success) {
            alert('Version requirement saved successfully');
            closeModal('appVersionModal');
            loadAppVersions();
        }
    } catch (error) {
        alert(error.message || 'Failed to save version requirement');
    }
});
