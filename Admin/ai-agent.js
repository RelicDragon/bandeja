/**
 * AI agent audit page (read-only).
 *
 * `GET /admin/agent/actions` is the log of every write the agent proposed and
 * what happened to it; `GET /admin/agent/usage` is daily (UTC) token sums per
 * user from agent runs, the estimated cost per day / user / model (agent
 * `LlmUsageLog` rows priced by `AGENT_PRICES_USD_PER_MTOK`), the daily budgets
 * in force, plus thumbs up/down per day; `GET /admin/agent/feedback` lists the
 * newest thumbs-down replies. Nothing here mutates: budgets and prices are
 * Platform settings rows (AGENT_DAILY_TOKEN_BUDGET, AGENT_ADMIN_DAILY_TOKEN_BUDGET,
 * AGENT_USER_DAILY_TOKEN_BUDGETS, AGENT_PRICES_USD_PER_MTOK).
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

function agentNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function agentUsd(value, unpricedCalls) {
    const amount = Number(value || 0);
    const text = amount >= 1 ? `$${amount.toFixed(2)}` : `$${amount.toFixed(4)}`;
    return unpricedCalls ? `${text} <span class="badge badge-warning" title="${escapeHtmlAttr(`${unpricedCalls} calls without a price`)}">+${unpricedCalls} unpriced</span>` : text;
}

function agentEmptyRow(colspan, text) {
    return `<tr><td colspan="${colspan}" style="text-align:center;padding:2rem">${escapeHtml(text)}</td></tr>`;
}

function renderAgentCost(data) {
    const summary = document.getElementById('agentCostSummary');
    if (summary) {
        const totals = data.totals || {};
        const budget = data.budget || {};
        const prices = data.prices || {};
        const priceSource = { setting: 'Platform setting', env: 'env', default: 'built-in estimates' }[prices.source] || '—';
        summary.innerHTML = `
            <strong>Est. total ${agentUsd(totals.costUsd, totals.unpricedCalls)}</strong>
            over ${escapeHtml(String(data.days || ''))} days since ${escapeHtml(formatDate(data.since))}
            · ${agentNumber(totals.calls)} LLM / metered calls.
            Daily budgets: users ${agentNumber(budget.user)}, admins ${agentNumber(budget.admin)} budget tokens,
            ${agentNumber(budget.overrides)} per-user override(s).
            Prices: ${escapeHtml(priceSource)} (USD per 1M tokens; set <code>AGENT_PRICES_USD_PER_MTOK</code> in Platform settings).
            <details><summary>Price table</summary>${agentJsonBlock(prices.table)}</details>`;
    }
    const tokenCells = (row) => `
        <td>${agentNumber(row.inputTokens)}</td>
        <td>${agentNumber(row.cachedInputTokens)}</td>
        <td>${agentNumber(row.outputTokens)}</td>
        <td>${agentUsd(row.costUsd, row.unpricedCalls)}</td>`;
    const dayBody = document.getElementById('agentCostDayBody');
    if (dayBody) {
        const days = data.costByDay || [];
        dayBody.innerHTML = days.length
            ? days.map((row) => `<tr><td>${escapeHtml(row.day)}</td><td>${row.users}</td><td>${agentNumber(row.calls)}</td>${tokenCells(row)}</tr>`).join('')
            : agentEmptyRow(7, 'No agent LLM usage in this range.');
    }
    const userBody = document.getElementById('agentCostUserBody');
    if (userBody) {
        const users = data.costByUser || [];
        userBody.innerHTML = users.length
            ? users
                  .map(
                      (row) => `<tr>
                <td title="${escapeHtmlAttr(row.userId)}">${escapeHtml(agentUserLabel(row.user, row.userId))}${row.user?.isAdmin ? ' <span class="badge badge-info">admin</span>' : ''}</td>
                <td>${agentNumber(row.calls)}</td>${tokenCells(row)}</tr>`
                  )
                  .join('')
            : agentEmptyRow(6, 'No agent LLM usage in this range.');
    }
    const modelBody = document.getElementById('agentCostModelBody');
    if (modelBody) {
        const models = data.costByModel || [];
        modelBody.innerHTML = models.length
            ? models
                  .map(
                      (row) => `<tr>
                <td><code>${escapeHtml(row.model)}</code>${row.priced ? '' : ' <span class="badge badge-warning">no price</span>'}</td>
                <td>${escapeHtml(row.reason || '—')}</td>
                <td>${agentNumber(row.calls)}</td>${tokenCells(row)}</tr>`
                  )
                  .join('')
            : agentEmptyRow(7, 'No agent LLM usage in this range.');
    }
}

function renderAgentUsage(rows) {
    const body = document.getElementById('agentUsageBody');
    if (!body) return;
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem">No agent runs in this range.</td></tr>';
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
                <td>${row.costUsd == null ? '—' : agentUsd(row.costUsd)}</td>
            </tr>`
        )
        .join('');
}

function renderAgentFeedbackDays(days) {
    const body = document.getElementById('agentFeedbackDaysBody');
    if (!body) return;
    if (!days.length) {
        body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:2rem">No ratings in this range.</td></tr>';
        return;
    }
    body.innerHTML = days
        .map(
            (day) => `<tr>
                <td>${escapeHtml(day.day)}</td>
                <td>${day.up}</td>
                <td>${day.down}</td>
            </tr>`
        )
        .join('');
}

function renderAgentFeedback(items) {
    const body = document.getElementById('agentFeedbackBody');
    if (!body) return;
    if (!items.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem">No thumbs-down replies.</td></tr>';
        return;
    }
    body.innerHTML = items
        .map(
            (item) => `<tr>
                <td>${escapeHtml(formatDate(item.feedbackAt || item.createdAt))}</td>
                <td title="${escapeHtmlAttr(item.user?.id)}">${escapeHtml(agentUserLabel(item.user))}</td>
                <td>${escapeHtml(item.userText || '—')}</td>
                <td title="${escapeHtmlAttr(`chat ${item.chatId} · message ${item.messageId}`)}">${escapeHtml(item.text || '—')}</td>
                <td>${escapeHtml(item.comment || '—')}</td>
            </tr>`
        )
        .join('');
}

async function loadAiAgentPage() {
    const actionsBody = document.getElementById('agentActionsBody');
    const usageBody = document.getElementById('agentUsageBody');
    const feedbackDaysBody = document.getElementById('agentFeedbackDaysBody');
    const feedbackBody = document.getElementById('agentFeedbackBody');
    const costBodies = ['agentCostDayBody', 'agentCostUserBody', 'agentCostModelBody']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    if (!actionsBody || !usageBody) return;
    const loading = '<tr><td colspan="7" style="text-align:center;padding:2rem">Loading…</td></tr>';
    actionsBody.innerHTML = loading;
    usageBody.innerHTML = loading;
    costBodies.forEach((body) => {
        body.innerHTML = loading;
    });
    if (feedbackDaysBody) feedbackDaysBody.innerHTML = loading;
    if (feedbackBody) feedbackBody.innerHTML = loading;

    const userId = agentFilterUserId();
    const status = document.getElementById('agentActionStatus')?.value || '';
    const actionParams = new URLSearchParams({ limit: '50' });
    if (userId) actionParams.set('userId', userId);
    if (status) actionParams.set('status', status);
    const usageParams = new URLSearchParams();
    if (userId) usageParams.set('userId', userId);
    const days = document.getElementById('agentUsageDays')?.value || '';
    if (days) usageParams.set('days', days);
    const usageQs = usageParams.toString();

    const feedbackParams = new URLSearchParams({ rating: 'down', limit: '50' });
    if (userId) feedbackParams.set('userId', userId);

    const [actionsResult, usageResult, feedbackResult] = await Promise.allSettled([
        apiRequest(`/admin/agent/actions?${actionParams.toString()}`),
        apiRequest(`/admin/agent/usage${usageQs ? `?${usageQs}` : ''}`),
        apiRequest(`/admin/agent/feedback?${feedbackParams.toString()}`),
    ]);
    const errorRow = (error) =>
        `<tr><td colspan="7" class="error">${escapeHtml(error?.message || 'Failed to load')}</td></tr>`;

    if (actionsResult.status === 'fulfilled') {
        renderAgentActions(actionsResult.value.data?.actions || []);
    } else {
        actionsBody.innerHTML = errorRow(actionsResult.reason);
    }
    if (usageResult.status === 'fulfilled') {
        renderAgentUsage(usageResult.value.data?.rows || []);
        renderAgentCost(usageResult.value.data || {});
        renderAgentFeedbackDays(usageResult.value.data?.feedback || []);
    } else {
        usageBody.innerHTML = errorRow(usageResult.reason);
        costBodies.forEach((body) => {
            body.innerHTML = errorRow(usageResult.reason);
        });
        if (feedbackDaysBody) feedbackDaysBody.innerHTML = errorRow(usageResult.reason);
    }
    if (feedbackResult.status === 'fulfilled') {
        renderAgentFeedback(feedbackResult.value.data?.feedback || []);
    } else if (feedbackBody) {
        feedbackBody.innerHTML = errorRow(feedbackResult.reason);
    }
}

function resetAiAgentFilters() {
    const status = document.getElementById('agentActionStatus');
    const userId = document.getElementById('agentUserId');
    const days = document.getElementById('agentUsageDays');
    if (status) status.value = '';
    if (userId) userId.value = '';
    if (days) days.value = '14';
    loadAiAgentPage();
}

window.loadAiAgentPage = loadAiAgentPage;
window.resetAiAgentFilters = resetAiAgentFilters;
window.toggleAgentActionDetails = toggleAgentActionDetails;
