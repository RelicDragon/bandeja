(function () {
  'use strict';

  function escapeHtml(text) {
    if (text == null) return '';
    const s = String(text);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return s.replace(/[&<>"']/g, (m) => map[m]);
  }

  function escapeHtmlAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.DataTable = class DataTable {
    constructor(options) {
      this.container = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
      this.columns = options.columns || [];
      this.filters = options.filters || [];
      this.fetchFn = options.fetchFn;
      this.renderRow = options.renderRow;
      this.emptyMessage = options.emptyMessage || 'No data found.';
      this.searchDebounceMs = options.searchDebounceMs ?? 300;
      this.pageSize = options.pageSize ?? 50;

      this.data = [];
      this.pagination = null;
      this.currentPage = 1;
      this.sortKey = null;
      this.sortDir = 'asc';
      this.searchTimeout = null;
      this.extraButtons = options.extraButtons || [];
      this.getExtraParams = options.getExtraParams || (() => ({}));
      this._instanceId = 'dt_' + Math.random().toString(36).slice(2);

      this._build();
      this._bindEvents();
    }

    _build() {
      const filterBar = document.createElement('div');
      filterBar.className = 'data-table-filters';
      filterBar.innerHTML = this._renderFilters();
      this.container.appendChild(filterBar);

      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-container';
      tableWrap.innerHTML = `
        <div class="data-table-loading" style="display:none;">Loading...</div>
        <div class="data-table-empty" style="display:none;">${escapeHtml(this.emptyMessage)}</div>
        <table class="data-table">
          <thead><tr></tr></thead>
          <tbody></tbody>
        </table>
      `;
      this.container.appendChild(tableWrap);

      this.loadingEl = tableWrap.querySelector('.data-table-loading');
      this.emptyEl = tableWrap.querySelector('.data-table-empty');
      this.theadRow = tableWrap.querySelector('thead tr');
      this.tbody = tableWrap.querySelector('tbody');
      this.tableEl = tableWrap.querySelector('table');

      this.paginationEl = document.createElement('div');
      this.paginationEl.className = 'pagination-bar data-table-pagination';
      this.container.appendChild(this.paginationEl);

      this._renderHeaders();
    }

    _renderFilters() {
      const parts = [];
      for (const f of this.filters) {
        if (f.type === 'search') {
          parts.push(`<input type="text" id="${f.id}" class="search-input data-table-filter" placeholder="${escapeHtmlAttr(f.placeholder || 'Search...')}" data-filter-type="search">`);
        } else if (f.type === 'select') {
          let opts = `<option value="">${escapeHtml(f.placeholder || 'All')}</option>`;
          if (f.options) {
            for (const o of f.options) opts += `<option value="${escapeHtmlAttr(o.value)}">${escapeHtml(o.label)}</option>`;
          }
          parts.push(`<select id="${f.id}" class="filter-select data-table-filter" data-filter-type="select">${opts}</select>`);
        } else if (f.type === 'date') {
          parts.push(`<input type="date" id="${f.id}" class="filter-date data-table-filter" title="${escapeHtmlAttr(f.label || f.id)}" data-filter-type="date">`);
        }
      }
      parts.push('<button type="button" class="btn-secondary" data-action="refresh">Refresh</button>');
      for (const btn of this.extraButtons) {
        parts.push(`<button type="button" class="${btn.className || 'btn-primary'}" data-action="${btn.action}">${escapeHtml(btn.label)}</button>`);
      }
      return parts.join('');
    }

    _renderHeaders() {
      this.theadRow.innerHTML = this.columns.map((col) => {
        const sortable = col.sortable !== false;
        const sortClass = sortable && this.sortKey === col.key ? ` sort-${this.sortDir}` : '';
        const click = sortable ? ` onclick="window.__dataTableInstances['${this._instanceId}'].sortBy('${col.key}')"` : '';
        return `<th class="data-table-th${sortClass}" data-key="${escapeHtmlAttr(col.key)}"${click}>${escapeHtml(col.label)}</th>`;
      }).join('');
    }

    _bindEvents() {
      window.__dataTableInstances = window.__dataTableInstances || {};
      window.__dataTableInstances[this._instanceId] = this;

      this.container.querySelectorAll('.data-table-filter').forEach((el) => {
        const f = this.filters.find((x) => x.id === el.id);
        if (f?.type === 'search') {
          el.addEventListener('input', () => this._debouncedFetch());
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.fetch(1); });
        } else {
          el.addEventListener('change', () => this.fetch(1));
        }
      });

      this.container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this.fetch(this.currentPage));
      this.container.querySelectorAll('[data-action]').forEach((btn) => {
        const action = btn.dataset.action;
        if (action !== 'refresh' && this.extraButtons.find((b) => b.action === action)) {
          btn.addEventListener('click', () => {
            const cfg = this.extraButtons.find((b) => b.action === action);
            if (cfg.onClick) cfg.onClick();
          });
        }
      });
    }

    _debouncedFetch() {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.fetch(1), this.searchDebounceMs);
    }

    getFilterValues() {
      const params = { ...this.getExtraParams() };
      for (const f of this.filters) {
        const el = document.getElementById(f.id);
        if (!el) continue;
        const v = (el.value?.trim?.() ?? el.value) ?? '';
        const param = f.param || f.id;
        if (v) params[param] = v;
      }
      return params;
    }

    sortBy(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortKey = key;
        this.sortDir = 'asc';
      }
      this._sortAndRender();
    }

    _sortAndRender() {
      if (!this.sortKey || this.data.length === 0) {
        this._renderRows(this.data);
        return;
      }
      const col = this.columns.find((c) => c.key === this.sortKey);
      const accessor = col?.accessor || ((r) => r[this.sortKey]);
      const sorted = [...this.data].sort((a, b) => {
        const va = accessor(a);
        const vb = accessor(b);
        let cmp = 0;
        if (va != null && vb != null) {
          if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
          else cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        } else if (va != null) cmp = 1;
        else if (vb != null) cmp = -1;
        return this.sortDir === 'asc' ? cmp : -cmp;
      });
      this._renderRows(sorted);
      this._renderHeaders();
    }

    _renderRows(rows) {
      if (!this.renderRow) return;
      this.tbody.innerHTML = rows.map((row) => this.renderRow(row)).join('');
    }

    async fetch(page = 1) {
      if (!this.fetchFn) return;
      this.currentPage = page;
      if (this.loadingEl) this.loadingEl.style.display = 'block';
      if (this.emptyEl) this.emptyEl.style.display = 'none';
      if (this.tableEl) this.tableEl.style.opacity = '0.5';

      try {
        const filterParams = this.getFilterValues();
        const result = await this.fetchFn({ page, ...filterParams });
        this.data = result.data || [];
        this.pagination = result.pagination || null;
        this._sortAndRender();
        this._renderPagination();
        if (this.emptyEl) this.emptyEl.style.display = this.data.length ? 'none' : 'block';
      } catch (err) {
        console.error('DataTable fetch error:', err);
      } finally {
        if (this.loadingEl) this.loadingEl.style.display = 'none';
        if (this.tableEl) this.tableEl.style.opacity = '1';
      }
    }

    _renderPagination() {
      const p = this.pagination;
      if (!p || !this.paginationEl) return;
      const totalPages = Math.ceil(p.total / p.pageSize);
      if (totalPages <= 1) {
        this.paginationEl.innerHTML = `<span class="pagination-info">${p.total} items</span>`;
        return;
      }
      let html = `<span class="pagination-info">${p.total} items, page ${p.page}/${totalPages}</span> `;
      if (p.page > 1) html += `<button class="btn-small btn-secondary" data-page="${p.page - 1}">Prev</button> `;
      if (p.page < totalPages) html += `<button class="btn-small btn-secondary" data-page="${p.page + 1}">Next</button>`;
      this.paginationEl.innerHTML = html;
      this.paginationEl.querySelectorAll('[data-page]').forEach((btn) => {
        btn.addEventListener('click', () => this.fetch(parseInt(btn.dataset.page, 10)));
      });
    }

    getFilterElement(id) {
      return document.getElementById(id);
    }
  };
})();
