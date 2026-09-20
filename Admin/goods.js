/**
 * PRD 355 — the cosmetics shop catalogue.
 *
 * Every endpoint behind this page is admin-only (`requireAdmin` on
 * `Backend/src/routes/goods.routes.ts`). Withdrawing never deletes a row:
 * transaction history points at it. Withdraw deactivates the item, refunds
 * every owner exactly once and clears it from their profiles.
 */

const GOODS_KIND_LABELS = {
    PROFILE_FRAME: 'Profile frame',
    CHAT_ACCENT: 'Chat accent',
    STICKER_PACK: 'Sticker pack',
    NAME_COLOR: 'Name colour',
};

function goodsKindLabel(kind) {
    return GOODS_KIND_LABELS[kind] || kind;
}

async function loadGoodsPage() {
    const kind = document.getElementById('goodsKindFilter')?.value || '';
    try {
        const response = await apiRequest(`/goods${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
        if (response.success) {
            renderGoodsTable(response.data || []);
        }
    } catch (error) {
        console.error('Failed to load goods:', error);
        const tbody = document.getElementById('goodsTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem;">${escapeHtml(error.message || 'Failed to load')}</td></tr>`;
        }
    }
}

function renderGoodsTable(items) {
    const tbody = document.getElementById('goodsTableBody');
    if (!tbody) return;
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No catalogue items yet. Add one to open the shop.</td></tr>';
        return;
    }
    tbody.innerHTML = items
        .map(
            (item) => `
        <tr>
            <td>${escapeHtml(goodsKindLabel(item.kind))}</td>
            <td>${escapeHtml(item.name)}</td>
            <td><code>${escapeHtml(item.assetKey)}</code></td>
            <td>${item.price}</td>
            <td><span class="badge ${item.isActive ? 'badge-success' : 'badge-danger'}">${item.isActive ? 'Active' : 'Hidden'}</span></td>
            <td>${item.isFeatured ? 'Yes' : '—'}</td>
            <td>${item.premiumOnly ? 'Yes' : '—'}</td>
            <td>${item.salesCount}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editGoodsModal(${JSON.stringify(item)})'>Edit</button>
                    <button class="btn-small btn-secondary" onclick="withdrawGoods('${item.id}')">Withdraw</button>
                    <button class="btn-small btn-delete" onclick="deleteGoods('${item.id}', ${item.salesCount})">Delete</button>
                </div>
            </td>
        </tr>
    `,
        )
        .join('');
}

function updateGoodsStickerPackVisibility() {
    const group = document.getElementById('goodsStickerPackGroup');
    if (!group) return;
    group.style.display = document.getElementById('goodsKind').value === 'STICKER_PACK' ? '' : 'none';
}

function setGoodsPreviewState(item) {
    const hint = document.getElementById('goodsPreviewHint');
    const image = document.getElementById('goodsPreviewImage');
    const file = document.getElementById('goodsPreviewFile');
    if (!hint || !image || !file) return;
    file.value = '';
    if (item && item.id) {
        hint.textContent = 'Choose a file and press Save to replace the preview art.';
        file.disabled = false;
    } else {
        hint.textContent = 'Save the item first, then reopen it to upload preview art.';
        file.disabled = true;
    }
    if (item && item.previewUrl) {
        image.src = item.previewUrl;
        image.alt = `${item.name} preview`;
        image.style.display = '';
    } else {
        image.removeAttribute('src');
        image.alt = '';
        image.style.display = 'none';
    }
}

function createGoodsModal() {
    document.getElementById('goodsModalTitle').textContent = 'Add Item';
    const form = document.getElementById('goodsForm');
    form.reset();
    form.dataset.mode = 'create';
    form.dataset.goodsId = '';
    document.getElementById('goodsIsActive').checked = true;
    document.getElementById('goodsPrice').value = '0';
    document.getElementById('goodsSortOrder').value = '0';
    updateGoodsStickerPackVisibility();
    setGoodsPreviewState(null);
    openModal('goodsModal');
}

function editGoodsModal(item) {
    document.getElementById('goodsModalTitle').textContent = 'Edit Item';
    const form = document.getElementById('goodsForm');
    form.dataset.mode = 'edit';
    form.dataset.goodsId = item.id;
    document.getElementById('goodsName').value = item.name;
    document.getElementById('goodsKind').value = item.kind;
    document.getElementById('goodsAssetKey').value = item.assetKey;
    document.getElementById('goodsStickerPackId').value = item.stickerPackId || '';
    document.getElementById('goodsPrice').value = item.price;
    document.getElementById('goodsDescription').value = item.description || '';
    document.getElementById('goodsSortOrder').value = item.sortOrder;
    document.getElementById('goodsIsActive').checked = item.isActive;
    document.getElementById('goodsIsFeatured').checked = item.isFeatured;
    document.getElementById('goodsPremiumOnly').checked = item.premiumOnly;
    updateGoodsStickerPackVisibility();
    setGoodsPreviewState(item);
    openModal('goodsModal');
}

async function handleGoodsSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const mode = form.dataset.mode;
    const goodsId = form.dataset.goodsId;
    const kind = document.getElementById('goodsKind').value;
    const stickerPackId = document.getElementById('goodsStickerPackId').value.trim();

    if (kind === 'STICKER_PACK' && !stickerPackId) {
        alert('A sticker pack item needs the id of the pack it unlocks.');
        return;
    }

    const payload = {
        name: document.getElementById('goodsName').value.trim(),
        kind,
        assetKey: document.getElementById('goodsAssetKey').value.trim(),
        price: parseInt(document.getElementById('goodsPrice').value, 10) || 0,
        description: document.getElementById('goodsDescription').value.trim() || null,
        sortOrder: parseInt(document.getElementById('goodsSortOrder').value, 10) || 0,
        isActive: document.getElementById('goodsIsActive').checked,
        isFeatured: document.getElementById('goodsIsFeatured').checked,
        premiumOnly: document.getElementById('goodsPremiumOnly').checked,
        stickerPackId: kind === 'STICKER_PACK' ? stickerPackId : null,
    };

    try {
        let savedId = goodsId;
        if (mode === 'create') {
            const created = await apiRequest('/goods', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            savedId = created.data && created.data.id;
        } else {
            await apiRequest(`/goods/${goodsId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
        }

        const file = document.getElementById('goodsPreviewFile').files[0];
        if (file && savedId) {
            const formData = new FormData();
            formData.append('preview', file);
            await window.apiMultipartRequest(`/goods/${savedId}/preview`, formData);
        }

        closeModal('goodsModal');
        loadGoodsPage();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function withdrawGoods(id) {
    try {
        const summary = await apiRequest(`/goods/${id}/withdraw-summary`);
        const { ownerCount, refundPerOwner, totalRefund } = summary.data;
        const ownersLabel = ownerCount === 1 ? '1 owner' : `${ownerCount} owners`;
        const question =
            ownerCount === 0
                ? 'Hide this item? Nobody owns it, so nothing is refunded.'
                : `Refund ${refundPerOwner} coins to ${ownersLabel} (${totalRefund} coins in total) and remove the item from their profiles?`;
        if (!confirm(question)) return;

        const result = await apiRequest(`/goods/${id}/withdraw`, { method: 'POST' });
        const { refundedCount, skippedCount } = result.data;
        toast(
            skippedCount > 0
                ? `Refunded ${refundedCount} owner(s); ${skippedCount} already had a refund.`
                : `Refunded ${refundedCount} owner(s).`,
        );
        loadGoodsPage();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteGoods(id, salesCount) {
    if (salesCount > 0) {
        alert('This item has owners. Use Withdraw so they get their coins back; deleting would erase wallet history.');
        return;
    }
    if (!confirm('Delete this catalogue item? This cannot be undone.')) return;
    try {
        await apiRequest(`/goods/${id}`, { method: 'DELETE' });
        loadGoodsPage();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.loadGoodsPage = loadGoodsPage;
window.createGoodsModal = createGoodsModal;
window.editGoodsModal = editGoodsModal;
window.handleGoodsSubmit = handleGoodsSubmit;
window.updateGoodsStickerPackVisibility = updateGoodsStickerPackVisibility;
window.withdrawGoods = withdrawGoods;
window.deleteGoods = deleteGoods;
