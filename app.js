const STORAGE_KEY = 'valorant-pollo-state-v1';
const DEFAULT_STATE = {
  apiKey: '',
  search: '',
  onlyWithRank: false,
  onlyErrors: false,
  cache: {},
};

const tierNames = {
  0: 'Unrated',
  1: 'Iron 1',
  2: 'Iron 2',
  3: 'Iron 3',
  4: 'Bronze 1',
  5: 'Bronze 2',
  6: 'Bronze 3',
  7: 'Silver 1',
  8: 'Silver 2',
  9: 'Silver 3',
  10: 'Gold 1',
  11: 'Gold 2',
  12: 'Gold 3',
  13: 'Platinum 1',
  14: 'Platinum 2',
  15: 'Platinum 3',
  16: 'Diamond 1',
  17: 'Diamond 2',
  18: 'Diamond 3',
  19: 'Ascendant 1',
  20: 'Ascendant 2',
  21: 'Ascendant 3',
  22: 'Immortal 1',
  23: 'Immortal 2',
  24: 'Immortal 3',
  25: 'Radiant',
};

const els = {
  list: document.getElementById('list'),
  stats: document.getElementById('stats'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  searchInput: document.getElementById('searchInput'),
  onlyWithRank: document.getElementById('onlyWithRank'),
  onlyErrors: document.getElementById('onlyErrors'),
  refreshBtn: document.getElementById('refreshBtn'),
  clearBtn: document.getElementById('clearBtn'),
  template: document.getElementById('cardTemplate'),
};

const state = loadState();
let accounts = [];
let lastPublicUpdate = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return { ...DEFAULT_STATE, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function accountKey(account) {
  return `${account.name}#${account.tag}`.toLowerCase();
}

function prettyDate(value) {
  if (!value) return 'Sin actualizar';
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettyTier(data) {
  if (!data) return 'Sin datos';
  const current = data.current || data.current_data || {};
  if (current.tier?.name) {
    const rr = typeof current.rr === 'number' ? ` ${current.rr} RR` : '';
    return `${current.tier.name}${rr}`;
  }
  if (typeof current.currenttier === 'number') {
    return tierNames[current.currenttier] || `Tier ${current.currenttier}`;
  }
  if (current.currenttier_patched) return current.currenttier_patched;
  return 'Sin datos';
}

function prettyRR(data) {
  const current = data?.current || data?.current_data || {};
  if (typeof current.rr === 'number') return `${current.rr}`;
  if (typeof current.ranking_in_tier === 'number') return `${current.ranking_in_tier}`;
  if (typeof current.currenttier === 'number') return `${current.currenttier}`;
  return '—';
}

function statusLabel(item) {
  if (item.loading) return { text: 'Cargando', cls: 'loading' };
  if (item.error) return { text: 'Error', cls: 'error' };
  if (item.data) return { text: 'Listo', cls: 'ok' };
  return { text: 'Pendiente', cls: 'loading' };
}

function renderStats() {
  const total = accounts.length;
  const loaded = accounts.filter(a => a.data).length;
  const errors = accounts.filter(a => a.error).length;
  const withRank = accounts.filter(a => a.data && prettyTier(a.data) !== 'Sin datos').length;

  els.stats.innerHTML = `
    <div class="stat"><div class="sub">Cuentas</div><div class="value">${total}</div></div>
    <div class="stat"><div class="sub">Rangos cargados</div><div class="value">${loaded}</div></div>
    <div class="stat"><div class="sub">Con rango visible</div><div class="value">${withRank}</div></div>
    <div class="stat"><div class="sub">Última actualización</div><div class="value small-date">${prettyDate(lastPublicUpdate)}</div></div>
  `;
}

function renderAccounts() {
  const query = state.search.trim().toLowerCase();
  const filtered = accounts.filter(account => {
    const matchesQuery = !query || `${account.name}#${account.tag}`.toLowerCase().includes(query);
    const matchesRank = !state.onlyWithRank || !!account.data;
    const matchesError = !state.onlyErrors || !!account.error;
    return matchesQuery && matchesRank && matchesError;
  });

  renderStats();
  els.list.innerHTML = '';

  for (const account of filtered) {
    const node = els.template.content.cloneNode(true);
    const player = node.querySelector('.player');
    const meta = node.querySelector('.meta');
    const status = node.querySelector('.status');
    const rank = node.querySelector('.rank');
    const rr = node.querySelector('.rr');
    const tracker = node.querySelector('.tracker');
    const raw = node.querySelector('.raw');
    const refreshCard = node.querySelector('.refresh-card');

    const currentStatus = statusLabel(account);
    player.textContent = `${account.name}#${account.tag}`;
    meta.textContent = `${(account.region || 'eu').toUpperCase()} · ${(account.platform || 'pc').toUpperCase()} · ${account.playlist || 'competitive'}`;
    status.className = `badge status ${currentStatus.cls}`;
    status.textContent = currentStatus.text;
    rank.textContent = account.error ? 'Sin rango' : prettyTier(account.data);
    rr.textContent = account.error ? '—' : prettyRR(account.data);
    tracker.href = account.tracker || `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${account.name}#${account.tag}`)}/overview`;
    raw.textContent = account.data
      ? JSON.stringify(account.data, null, 2)
      : account.error
        ? JSON.stringify(account.error, null, 2)
        : 'Sin datos todavía.';

    refreshCard.addEventListener('click', forcePublicRefresh);
    els.list.appendChild(node);
  }
}

async function loadPublicRanks() {
  els.list.innerHTML = '<p class="hint">Cargando rangos guardados del servidor...</p>';
  const response = await fetch('/api/public-ranks');
  const payload = await response.json();

  lastPublicUpdate = payload.updatedAt || null;

  if (!response.ok || payload.error) {
    els.list.innerHTML = `<p class="hint">${payload.error || 'No se pudieron cargar los rangos.'}</p>`;
    return;
  }

  accounts = (payload.results || []).map(result => ({
    ...result.account,
    data: result.ok ? result.data : null,
    error: result.ok ? null : result.error || 'Error desconocido',
    loading: false,
  }));

  renderAccounts();
}

async function forcePublicRefresh() {
  if (els.refreshBtn) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = 'Actualizando...';
  }

  try {
    const response = await fetch('/api/public-ranks/refresh', { method: 'POST' });
    const payload = await response.json();
    lastPublicUpdate = payload.updatedAt || null;

    accounts = (payload.results || []).map(result => ({
      ...result.account,
      data: result.ok ? result.data : null,
      error: result.ok ? null : result.error || 'Error desconocido',
      loading: false,
    }));

    renderAccounts();
  } catch (error) {
    els.list.innerHTML = `<p class="hint">Error actualizando: ${error.message}</p>`;
  } finally {
    if (els.refreshBtn) {
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = 'Actualizar rangos';
    }
  }
}

function clearCache() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function bindInputs() {
  if (els.apiKeyInput) {
    els.apiKeyInput.closest('.field').style.display = 'none';
  }

  els.searchInput.value = state.search;
  els.onlyWithRank.checked = state.onlyWithRank;
  els.onlyErrors.checked = state.onlyErrors;

  els.searchInput.addEventListener('input', () => {
    state.search = els.searchInput.value;
    saveState();
    renderAccounts();
  });

  els.onlyWithRank.addEventListener('change', () => {
    state.onlyWithRank = els.onlyWithRank.checked;
    saveState();
    renderAccounts();
  });

  els.onlyErrors.addEventListener('change', () => {
    state.onlyErrors = els.onlyErrors.checked;
    saveState();
    renderAccounts();
  });

  els.refreshBtn.addEventListener('click', forcePublicRefresh);
  els.clearBtn.addEventListener('click', clearCache);
}

async function init() {
  bindInputs();
  await loadPublicRanks();
}

init();
