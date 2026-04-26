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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function setCache(accountKey, payload) {
  state.cache[accountKey] = {
    updatedAt: Date.now(),
    payload,
  };
  saveState();
}

function getCache(accountKey) {
  const item = state.cache[accountKey];
  if (!item) return null;
  const age = Date.now() - item.updatedAt;
  if (age > 10 * 60 * 1000) return null;
  return item.payload;
}

function accountKey(account) {
  return `${account.name}#${account.tag}`.toLowerCase();
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
  if (current.currenttier_patched) {
    return current.currenttier_patched;
  }
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

function renderStats(filtered) {
  const total = accounts.length;
  const loaded = accounts.filter(a => a.data).length;
  const errors = accounts.filter(a => a.error).length;
  const withRank = accounts.filter(a => a.data && prettyTier(a.data) !== 'Sin datos').length;
  els.stats.innerHTML = `
    <div class="stat"><div class="sub">Cuentas</div><div class="value">${total}</div></div>
    <div class="stat"><div class="sub">Rangos cargados</div><div class="value">${loaded}</div></div>
    <div class="stat"><div class="sub">Con rango visible</div><div class="value">${withRank}</div></div>
    <div class="stat"><div class="sub">Errores</div><div class="value">${errors}</div></div>
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

  renderStats(filtered);
  els.list.innerHTML = '';

  for (const account of filtered) {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector('.card');
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
    meta.textContent = `${account.region.toUpperCase()} · ${account.platform.toUpperCase()} · ${account.playlist}`;
    status.className = `badge status ${currentStatus.cls}`;
    status.textContent = currentStatus.text;
    rank.textContent = account.error ? 'Sin rango' : prettyTier(account.data);
    rr.textContent = account.error ? '—' : prettyRR(account.data);
    tracker.href = account.tracker;
    raw.textContent = account.data
      ? JSON.stringify(account.data, null, 2)
      : account.error
        ? JSON.stringify(account.error, null, 2)
        : 'Sin datos todavía.';

    refreshCard.addEventListener('click', () => fetchRankFor(account, true));
    els.list.appendChild(node);
  }
}

async function loadAccounts() {
  const response = await fetch('/api/accounts');
  const payload = await response.json();
  accounts = payload.accounts.map(account => {
    const cached = getCache(accountKey(account));
    if (cached?.data) {
      return { ...account, data: cached.data, error: null };
    }
    return { ...account, data: null, error: null };
  });
  renderAccounts();
}

async function fetchRankFor(account, force = false) {
  const index = accounts.findIndex(item => accountKey(item) === accountKey(account));
  if (index === -1) return;
  if (accounts[index].data && !force) return;

  accounts[index] = { ...accounts[index], loading: true, error: null };
  renderAccounts();

  try {
    const response = await fetch('/api/rank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: state.apiKey,
        accounts: [accounts[index]],
      }),
    });

    const payload = await response.json();
    const result = payload.results?.[0];

    if (!response.ok || !result) {
      throw new Error(payload.error || 'No response from server');
    }

    if (result.ok) {
      accounts[index] = { ...accounts[index], loading: false, data: result.data, error: null };
      setCache(accountKey(accounts[index]), { data: result.data });
    } else {
      const detail = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
      accounts[index] = { ...accounts[index], loading: false, data: null, error: detail || 'Error desconocido' };
    }
  } catch (error) {
    accounts[index] = { ...accounts[index], loading: false, data: null, error: error.message || 'Error' };
  }

  renderAccounts();
}

async function refreshAll() {
  const visible = accounts.filter(account => {
    const query = state.search.trim().toLowerCase();
    const matchesQuery = !query || `${account.name}#${account.tag}`.toLowerCase().includes(query);
    const matchesRank = !state.onlyWithRank || !!account.data;
    const matchesError = !state.onlyErrors || !!account.error;
    return matchesQuery && matchesRank && matchesError;
  });

  for (const account of visible) {
    await fetchRankFor(account, true);
    await sleep(1200);
  }
}

function clearCache() {
  state.cache = {};
  saveState();
  accounts = accounts.map(account => ({ ...account, data: null, error: null }));
  renderAccounts();
}

function bindInputs() {
  els.apiKeyInput.value = state.apiKey;
  els.searchInput.value = state.search;
  els.onlyWithRank.checked = state.onlyWithRank;
  els.onlyErrors.checked = state.onlyErrors;

  els.apiKeyInput.addEventListener('input', () => {
    state.apiKey = els.apiKeyInput.value.trim();
    saveState();
  });

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

  els.refreshBtn.addEventListener('click', refreshAll);
  els.clearBtn.addEventListener('click', clearCache);
}

async function init() {
  bindInputs();
  await loadAccounts();
  renderAccounts();
  if (state.apiKey && accounts.some(account => !account.data)) {
    await refreshAll();
  }
}

init();
