/**
 * AI agent audit page (read-only).
 *
 * `GET /admin/agent/actions` is the log of every write the agent proposed and
 * what happened to it; `GET /admin/agent/usage` is daily (UTC) token sums per
 * user from agent runs. Nothing here mutates: no confirm/reject buttons.
 */

const AGENT_ACTION_STATUS_BADGE = {
    PENDING: 'badge-warning',
    CONFIRMED: 'badge-info',
    EXECUTED: 'badge-success',
    REJECTED: 'badge-secondary',
    EXPIRED: 'badge-secondary',
    FAILED: 'badge-danger',
};

function agentUserLabel(user, userId) {
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
    return name || userId || user?.id || '—';
}

function agentFilterUserId() {
    return document.getElementById('agentUserId')?.value.trim() || '';
}

function agentJsonBlock(value) {
    if (value == null) return '<span>—</span>';
    return `<pre class="ads-preset-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function agentPreviewLines(preview) {
    const lines = Array.isArray(preview?.lines) ? preview.lines : [];
    const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];
    if (!lines.length && !warnings.length) return '<p>No preview lines.</p>';
    const lineItems = lines
        .map((line) => {
            const change =
                line.from != null && line.to != null
                    ? `${escapeHtml(line.from)} → ${escapeHtml(line.to)}`
                    : escapeHtml(line.to ?? line.from ?? '');
            return `<li><strong>${escapeHtml(line.label)}</strong>: ${change}</li>`;
        })
        .join('');
    const warningItems = warnings
        .map((w) => `<li><span class="badge badge-warning">Warning</span> ${escapeHtml(w)}</li>`)
        .join('');
    return `<ul>${lineItems}${warningItems}</ul>`;
}

function agentActionDetails(action) {
    return `
        <p><strong>Action</strong> <code>${escapeHtml(action.id)}</code>
            · chat <code>${escapeHtml(action.chatId || '—')}</code>
            · run <code>${escapeHtml(action.runId || '—')}</code>
            · expires ${escapeHtml(formatDate(action.expiresAt))}
            · executed ${action.executedAt ? escapeHtml(formatDate(action.executedAt)) : '—'}</p>
        <h4>Preview</h4>
        ${agentPreviewLines(action.preview)}
        <h4>Args</h4>
        ${agentJsonBlock(action.args)}
        <h4>Result</h4>
        ${agentJsonBlock(action.result)}
        ${action.error ? `<h4>Error</h4><pre class="ads-preset-json">${escapeHtml(action.error)}</pre>` : ''}`;
}

function renderAgentActions(actions) {
    const body = document.getElementById('agentActionsBody');
    if (!body) return;
    if (!actions.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">No agent actions.</td></tr>';
        return;
    }
    body.innerHTML = actions
        .map((action, index) => {
            const badge = AGENT_ACTION_STATUS_BADGE[action.status] || 'badge-secondary';
            return `<tr>
                <td>${escapeHtml(formatDate(action.createdAt))}</td>
                <td title="${escapeHtmlAttr(action.user?.id)}">${escapeHtml(agentUserLabel(action.user))}</td>
                <td><code>${escapeHtml(action.toolName)}</code></td>
                <td><span class="badge ${badge}">${escapeHtml(action.status)}</span></td>
                <td>${escapeHtml(action.preview?.title || '—')}</td>
                <td><button type="button" class="btn-secondary" onclick="toggleAgentActionDetails(${index})">Details</button></td>
            </tr>
            <tr id="agentActionDetails-${index}" style="display:none">
                <td colspan="6">${agentActionDetails(action)}</td>
            </tr>`;
        })
        .join('');
}

function toggleAgentActionDetails(index) {
    const row = document.getElementById(`agentActionDetails-${index}`);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function renderAgentUsage(rows) {
    const body = document.getElementById('agentUsageBody');
    if (!body) return;
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">No agent runs in this range.</td></tr>';
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `<tr>
                <td>${escapeHtml(row.day)}</td>
                <td title="${escapeHtmlAttr(row.userId)}">${escapeHtml(agentUserLabel(row.user, row.userId))}</td>
                <td>${row.runs}</td>
                <td>${row.inputTokens}</td>
                <td>${row.outputTokens}</td>
                <td>${row.totalTokens}</td>
            </tr>`
        )
        .join('');
}

async function loadAiAgentPage() {
    const actionsBody = document.getElementById('agentActionsBody');
    const usageBody = document.getElementById('agentUsageBody');
    if (!actionsBody || !usageBody) return;
    const loading = '<tr><td colspan="6" style="text-align:center;padding:2rem">Loading…</td></tr>';
    actionsBody.innerHTML = loading;
    usageBody.innerHTML = loading;

    const userId = agentFilterUserId();
    const status = document.getElementById('agentActionStatus')?.value || '';
    const actionParams = new URLSearchParams({ limit: '50' });
    if (userId) actionParams.set('userId', userId);
    if (status) actionParams.set('status', status);
    const usageParams = new URLSearchParams();
    if (userId) usageParams.set('userId', userId);
    const usageQs = usageParams.toString();

    const [actionsResult, usageResult] = await Promise.allSettled([
        apiRequest(`/admin/agent/actions?${actionParams.toString()}`),
        apiRequest(`/admin/agent/usage${usageQs ? `?${usageQs}` : ''}`),
    ]);
    const errorRow = (error) =>
        `<tr><td colspan="6" class="error">${escapeHtml(error?.message || 'Failed to load')}</td></tr>`;

    if (actionsResult.status === 'fulfilled') {
        renderAgentActions(actionsResult.value.data?.actions || []);
    } else {
        actionsBody.innerHTML = errorRow(actionsResult.reason);
    }
    if (usageResult.status === 'fulfilled') {
        renderAgentUsage(usageResult.value.data?.rows || []);
    } else {
        usageBody.innerHTML = errorRow(usageResult.reason);
    }
}

function resetAiAgentFilters() {
    const status = document.getElementById('agentActionStatus');
    const userId = document.getElementById('agentUserId');
    if (status) status.value = '';
    if (userId) userId.value = '';
    loadAiAgentPage();
}

window.loadAiAgentPage = loadAiAgentPage;
window.resetAiAgentFilters = resetAiAgentFilters;
window.toggleAgentActionDetails = toggleAgentActionDetails;
