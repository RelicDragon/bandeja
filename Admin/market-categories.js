async function loadMarketCategories() {
    try {
        const response = await apiRequest('/admin/market-categories');
        if (response.success) {
            renderMarketCategoriesTable(response.data);
        }
    } catch (error) {
        console.error('Failed to load market categories:', error);
    }
}

function renderMarketCategoriesTable(categories) {
    const tbody = document.getElementById('marketCategoriesTableBody');
    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No categories. Add one to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = categories.map(cat => `
        <tr>
            <td>${cat.name}</td>
            <td>${cat.order}</td>
            <td>${cat._count?.items ?? 0}</td>
            <td>
                <span class="badge ${cat.isActive ? 'badge-success' : 'badge-danger'}">
                    ${cat.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-edit" onclick='editMarketCategoryModal(${JSON.stringify(cat)})'>Edit</button>
                    <button class="btn-small btn-delete" onclick="deleteMarketCategory('${cat.id}', '${cat.name.replace(/'/g, "\\'")}', ${cat._count?.items ?? 0})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function createMarketCategoryModal() {
    document.getElementById('marketCategoryModalTitle').textContent = 'Create Category';
    document.getElementById('marketCategoryForm').reset();
    document.getElementById('marketCategoryOrder').value = '0';
    document.getElementById('marketCategoryForm').dataset.mode = 'create';
    document.getElementById('marketCategoryForm').dataset.categoryId = '';
    openModal('marketCategoryModal');
}

function editMarketCategoryModal(cat) {
    document.getElementById('marketCategoryModalTitle').textContent = 'Edit Category';
    document.getElementById('marketCategoryName').value = cat.name;
    document.getElementById('marketCategoryOrder').value = cat.order;
    document.getElementById('marketCategoryIsActive').checked = cat.isActive;
    document.getElementById('marketCategoryForm').dataset.mode = 'edit';
    document.getElementById('marketCategoryForm').dataset.categoryId = cat.id;
    openModal('marketCategoryModal');
}

async function handleMarketCategorySubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const categoryId = form.dataset.categoryId;
    const data = {
        name: document.getElementById('marketCategoryName').value.trim(),
        order: parseInt(document.getElementById('marketCategoryOrder').value) || 0,
        isActive: document.getElementById('marketCategoryIsActive').checked,
    };
    try {
        if (mode === 'create') {
            await apiRequest('/admin/market-categories', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } else {
            await apiRequest(`/admin/market-categories/${categoryId}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        }
        closeModal('marketCategoryModal');
        loadMarketCategories();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteMarketCategory(id, name, itemsCount) {
    if (itemsCount > 0) {
        alert(`Cannot delete category "${name}" - it has ${itemsCount} item(s).`);
        return;
    }
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
        await apiRequest(`/admin/market-categories/${id}`, { method: 'DELETE' });
        loadMarketCategories();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}
