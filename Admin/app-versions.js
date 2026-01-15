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
    tbody.innerHTML = versions.map(version => `
        <tr>
            <td>${version.platform.toUpperCase()}</td>
            <td>${version.minBuildNumber}</td>
            <td>${version.minVersion}</td>
            <td>${version.isBlocking ? '<span class="badge badge-danger">Blocking</span>' : '<span class="badge badge-warning">Optional</span>'}</td>
            <td>${version.message || '-'}</td>
            <td>${formatDate(version.updatedAt)}</td>
            <td>
                <button class="btn-secondary" onclick="editAppVersion('${version.platform}', ${version.minBuildNumber}, '${version.minVersion}', ${version.isBlocking}, '${version.message || ''}')">Edit</button>
                <button class="btn-danger" onclick="deleteAppVersion('${version.platform}')">Delete</button>
            </td>
        </tr>
    `).join('');
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
