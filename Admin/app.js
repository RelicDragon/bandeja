const API_URL = 'http://localhost:3000/api';
let authToken = null;
let selectedCityId = '';

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

    const activeLink = document.querySelector(`[data-page="${pageName}"]`);
    const activePage = document.getElementById(`${pageName}Page`);

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
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
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

async function loadUsers() {
    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/users${queryParams}`);
        if (response.success) {
            renderUsersTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(user => {
        const genderDisplay = user.gender ? 
            user.gender === 'MALE' ? 'Male' : 
            user.gender === 'FEMALE' ? 'Female' : 
            user.gender === 'PREFER_NOT_TO_SAY' ? 'Prefer not to say' : '-' : '-';
        return `
        <tr>
            <td>${user.firstName || ''} ${user.lastName || ''}</td>
            <td>${user.phone || '-'}</td>
            <td>${user.email || '-'}</td>
            <td>${genderDisplay}</td>
            <td>${user.level.toFixed(1)}</td>
            <td>${user.gamesPlayed}</td>
            <td>${user.totalPoints}</td>
            <td>
                <span class="badge ${user.isActive ? 'badge-success' : 'badge-danger'}">
                    ${user.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <span class="badge ${user.isAdmin ? 'badge-info' : 'badge-warning'}">
                    ${user.isAdmin ? 'Yes' : 'No'}
                </span>
            </td>
            <td>
                <span class="badge ${user.isTrainer ? 'badge-info' : 'badge-warning'}">
                    ${user.isTrainer ? 'Yes' : 'No'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editUserModal(${JSON.stringify(user)})'>Edit</button>
                    <button class="btn-small btn-toggle" onclick="toggleUserStatus('${user.id}')">
                        ${user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn-small btn-warning" onclick='resetPasswordModal("${user.id}", "${(user.firstName || '') + ' ' + (user.lastName || '')}".trim() || "${user.phone}")'>Reset Password</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
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

async function loadGames() {
    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/games${queryParams}`);
        if (response.success) {
            renderGamesTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load games:', error);
    }
}

function renderGamesTable(games) {
    const tbody = document.getElementById('gamesTableBody');
    tbody.innerHTML = games.map(game => {
        const location = game.court ? 
            `${game.court.club.name}, ${game.court.club.city.name}` : 
            'No location';
        return `
            <tr>
                <td>
                    <span class="badge ${game.entityType === 'BAR' ? 'badge-warning' : game.entityType === 'TRAINING' ? 'badge-info' : 'badge-info'}">
                        ${game.entityType === 'BAR' ? '🍺 BAR' : game.entityType === 'TRAINING' ? '🎓 TRAINING' : game.gameType}
                    </span>
                </td>
                <td>${location}</td>
                <td>${formatDate(game.startTime)}</td>
                <td>${game.participants.length}</td>
                <td><span class="badge badge-warning">${game.status}</span></td>
                <td>
                    <span class="badge ${game.hasResults ? 'badge-success' : 'badge-danger'}">
                        ${game.hasResults ? 'Yes' : 'No'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit" onclick='viewGameModal(${JSON.stringify(game)})'>View</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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
                    <button class="btn-small btn-delete" onclick="deleteCity('${city.id}', '${city.name}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
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

function viewGameModal(game) {
    document.getElementById('gameModalTitle').textContent = `Game Details - ${game.gameType}`;
    
    // Game Information
    document.getElementById('gameEntityType').textContent = game.entityType || '-';
    document.getElementById('gameGameType').textContent = game.gameType || '-';
    document.getElementById('gameName').textContent = game.name || '-';
    document.getElementById('gameDescription').textContent = game.description || '-';
    document.getElementById('gameStartTime').textContent = formatDate(game.startTime);
    document.getElementById('gameEndTime').textContent = formatDate(game.endTime);
    document.getElementById('gameMinParticipants').textContent = game.minParticipants || '-';
    document.getElementById('gameMaxParticipants').textContent = game.maxParticipants || '-';
    document.getElementById('gameLevel').textContent = (game.minLevel !== null && game.minLevel !== undefined && game.maxLevel !== null && game.maxLevel !== undefined) 
        ? `${game.minLevel.toFixed(1)} - ${game.maxLevel.toFixed(1)}` 
        : '-';
    
    // Location
    const clubName = game.court?.club?.name || game.club?.name || '-';
    const courtName = game.court?.name || '-';
    document.getElementById('gameClub').textContent = clubName;
    document.getElementById('gameCourt').textContent = courtName;
    
    // Game Settings
    document.getElementById('gameStatus').textContent = game.status || '-';
    document.getElementById('gameHasResults').textContent = game.hasResults ? 'Yes' : 'No';
    document.getElementById('gameIsPublic').textContent = game.isPublic ? 'Yes' : 'No';
    document.getElementById('gameAffectsRating').textContent = game.affectsRating ? 'Yes' : 'No';
    document.getElementById('gameAnyoneCanInvite').textContent = game.anyoneCanInvite ? 'Yes' : 'No';
    document.getElementById('gameResultsByAnyone').textContent = game.resultsByAnyone ? 'Yes' : 'No';
    document.getElementById('gameHasBookedCourt').textContent = game.hasBookedCourt ? 'Yes' : 'No';
    
    // Participants
    document.getElementById('gameParticipantsCount').textContent = `${game.participants?.length || 0} / ${game.maxParticipants || 0}`;
    
    const participantsList = document.getElementById('gameParticipantsList');
    if (game.participants && game.participants.length > 0) {
        participantsList.innerHTML = game.participants.map(participant => `
            <div class="participant-item">
                <div class="participant-info">
                    <strong>${participant.user.firstName || ''} ${participant.user.lastName || ''}</strong>
                    <span class="participant-role">(${participant.role})</span>
                </div>
                <div class="participant-details">
                    <span class="participant-level">Level: ${participant.user.level?.toFixed(1) || 'N/A'}</span>
                    <span class="participant-joined">Joined: ${formatDate(participant.joinedAt)}</span>
                </div>
            </div>
        `).join('');
    } else {
        participantsList.innerHTML = '<p>No participants</p>';
    }
    
    // Metadata
    document.getElementById('gameCreatedAt').textContent = formatDate(game.createdAt);
    
    document.getElementById('gameModal').style.display = 'flex';
}

async function loadInvites() {
    try {
        const queryParams = selectedCityId ? `?cityId=${selectedCityId}` : '';
        const response = await apiRequest(`/admin/invites${queryParams}`);
        if (response.success) {
            renderInvitesTable(response.data);
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
        const senderName = `${invite.sender?.firstName || ''} ${invite.sender?.lastName || ''}`.trim() || invite.sender?.phone || 'Unknown';
        const receiverName = `${invite.receiver?.firstName || ''} ${invite.receiver?.lastName || ''}`.trim() || invite.receiver?.phone || 'Unknown';
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

window.toggleUserStatus = toggleUserStatus;
window.loadCities = loadCities;
window.loadClubs = loadClubs;
window.viewCenterCourts = viewCenterCourts;
window.backToCenters = backToCenters;
window.handleGlobalCityChange = handleGlobalCityChange;
window.loadHistoricalLogs = loadHistoricalLogs;
window.toggleLogStream = toggleLogStream;
window.clearLogs = clearLogs;
window.viewGameModal = viewGameModal;
window.acceptInvite = acceptInvite;
window.declineInvite = declineInvite;
window.refreshInvites = refreshInvites;

document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('adminToken');
    const savedAdmin = localStorage.getItem('adminData');

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

