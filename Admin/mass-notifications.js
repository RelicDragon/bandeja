async function handleMassNotificationSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('massNotificationTitle').value.trim();
    const text = document.getElementById('massNotificationText').value.trim();
    const cityId = document.getElementById('massNotificationCity').value || undefined;
    const btn = document.getElementById('massNotificationSubmitBtn');
    const resultDiv = document.getElementById('massNotificationResult');

    if (!title || !text) {
        resultDiv.textContent = 'Title and text are required';
        resultDiv.style.display = 'block';
        resultDiv.className = 'mass-notification-result error';
        return;
    }

    btn.disabled = true;
    resultDiv.style.display = 'none';

    try {
        const params = cityId ? `?cityId=${encodeURIComponent(cityId)}` : '';
        const response = await apiRequest(`/admin/mass-notification${params}`, {
            method: 'POST',
            body: JSON.stringify({ title, text }),
        });

        if (response.success) {
            const d = response.data;
            resultDiv.innerHTML = `Total users: ${d.totalUsers}<br>Push sent: ${d.pushSent} devices<br>Telegram sent: ${d.telegramSent} users` +
                (d.pushFailed > 0 || d.telegramFailed > 0 ? `<br><span class="error">Failed: Push ${d.pushFailed}, Telegram ${d.telegramFailed}</span>` : '');
            resultDiv.style.display = 'block';
            resultDiv.className = 'mass-notification-result success';
        }
    } catch (error) {
        resultDiv.textContent = error.message || 'Failed to send';
        resultDiv.style.display = 'block';
        resultDiv.className = 'mass-notification-result error';
    } finally {
        btn.disabled = false;
    }
}

async function loadMassNotificationsPage() {
    try {
        const response = await apiRequest('/admin/cities');
        if (response.success) {
            const select = document.getElementById('massNotificationCity');
            select.innerHTML = '<option value="">All Cities</option>' +
                response.data.map(city => `<option value="${city.id}">${city.name}</option>`).join('');
            if (typeof selectedCityId !== 'undefined' && selectedCityId) {
                select.value = selectedCityId;
            }
        }
    } catch (error) {
        console.error('Failed to load cities:', error);
    }
}
