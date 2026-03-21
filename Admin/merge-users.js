(function () {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const mergeState = {
    survivorId: null,
    sourceId: null,
  };

  function mergeUserLabel(u) {
    const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    return n || u.phone || u.email || u.id || '?';
  }

  function mergeClear(which) {
    if (which === 'survivor') {
      mergeState.survivorId = null;
      document.getElementById('mergeSurvivorPicked').textContent = '—';
    } else {
      mergeState.sourceId = null;
      document.getElementById('mergeSourcePicked').textContent = '—';
    }
  }

  function mergeSetPick(which, id, displayText) {
    if (which === 'survivor') {
      mergeState.survivorId = id;
      document.getElementById('mergeSurvivorPicked').textContent = displayText;
    } else {
      mergeState.sourceId = id;
      document.getElementById('mergeSourcePicked').textContent = displayText;
    }
  }

  async function mergeDoSearch(which) {
    const inputId = which === 'survivor' ? 'mergeSurvivorSearch' : 'mergeSourceSearch';
    const outId = which === 'survivor' ? 'mergeSurvivorResults' : 'mergeSourceResults';
    const q = document.getElementById(inputId).value.trim();
    const out = document.getElementById(outId);
    out.innerHTML = '';
    if (!q) {
      out.textContent = '';
      return;
    }
    if (UUID_RE.test(q)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-small btn-secondary';
      b.textContent = 'Use UUID as selection';
      b.onclick = () =>
        mergeSetPick(which, q, `${q} (by ID)`);
      out.appendChild(b);
      return;
    }
    if (q.length < 2) {
      out.textContent = 'Type at least 2 characters, or paste a user UUID';
      return;
    }
    out.textContent = 'Searching…';
    try {
      const params = new URLSearchParams({ search: q, page: '1' });
      const cityId = document.getElementById('globalCityFilter')?.value;
      if (cityId) params.set('cityId', cityId);
      const response = await apiRequest(`/admin/users?${params.toString()}`);
      if (!response.success || !response.data?.length) {
        out.textContent = 'No users found.';
        return;
      }
      out.innerHTML = '';
      for (const u of response.data) {
        const phone = u.phone || '—';
        const label = `${mergeUserLabel(u)} · ${phone}`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-small btn-secondary merge-user-pick-btn';
        b.textContent = label;
        b.onclick = () => mergeSetPick(which, u.id, `${label} · ${u.id}`);
        out.appendChild(b);
      }
    } catch (e) {
      out.textContent = e.message || 'Search failed';
    }
  }

  let tSurv;
  let tSrc;

  function mergeUsersModal(prefillSurvivorId) {
    mergeState.survivorId = null;
    mergeState.sourceId = null;
    document.getElementById('mergeSurvivorSearch').value = '';
    document.getElementById('mergeSourceSearch').value = '';
    document.getElementById('mergeSurvivorResults').innerHTML = '';
    document.getElementById('mergeSourceResults').innerHTML = '';
    document.getElementById('mergeSurvivorPicked').textContent = '—';
    document.getElementById('mergeSourcePicked').textContent = '—';

    if (prefillSurvivorId) {
      const u = window.__pageUsers?.find((x) => x.id === prefillSurvivorId);
      if (u) {
        const label = `${mergeUserLabel(u)} · ${u.phone || '—'} · ${u.id}`;
        mergeSetPick('survivor', u.id, label);
      } else {
        mergeSetPick('survivor', prefillSurvivorId, `${prefillSurvivorId} (from row)`);
      }
    }

    openModal('mergeUsersModal');
  }

  async function handleMergeUsersSubmit(e) {
    e.preventDefault();
    const survivorId = mergeState.survivorId;
    const sourceId = mergeState.sourceId;
    if (!survivorId || !sourceId) {
      alert('Select both the account to keep and the source account.');
      return;
    }
    if (survivorId === sourceId) {
      alert('Survivor and source must be different users.');
      return;
    }
    if (
      !confirm(
        'Merge source into survivor? The source user will be deleted after data is moved. This cannot be undone.',
      )
    ) {
      return;
    }
    const btn = document.getElementById('mergeUsersSubmitBtn');
    btn.disabled = true;
    try {
      await apiRequest('/admin/users/merge', {
        method: 'POST',
        body: JSON.stringify({ survivorId, sourceId }),
      });
      toast('Users merged successfully', 'success');
      closeModal('mergeUsersModal');
      if (typeof window.loadUsers === 'function') {
        const p = window.usersDataTable?.currentPage ?? 1;
        window.loadUsers(p);
      }
    } catch (err) {
      alert(err.message || 'Merge failed');
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sIn = document.getElementById('mergeSurvivorSearch');
    const srcIn = document.getElementById('mergeSourceSearch');
    if (sIn) {
      sIn.addEventListener('input', () => {
        clearTimeout(tSurv);
        tSurv = setTimeout(() => mergeDoSearch('survivor'), 400);
      });
    }
    if (srcIn) {
      srcIn.addEventListener('input', () => {
        clearTimeout(tSrc);
        tSrc = setTimeout(() => mergeDoSearch('source'), 400);
      });
    }
    document.getElementById('mergeUsersForm')?.addEventListener('submit', handleMergeUsersSubmit);
  });

  window.mergeUsersModal = mergeUsersModal;
  window.mergeClearSurvivor = () => mergeClear('survivor');
  window.mergeClearSource = () => mergeClear('source');
})();
