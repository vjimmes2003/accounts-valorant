const STORAGE_KEY = 'valorant-hub-public-v2';
const DEFAULT_STATE = { search: '', onlyWithRank: false, onlyErrors: false };

const tierNames = {
  0: 'Unrated', 1: 'Iron 1', 2: 'Iron 2', 3: 'Iron 3', 4: 'Bronze 1', 5: 'Bronze 2', 6: 'Bronze 3',
  7: 'Silver 1', 8: 'Silver 2', 9: 'Silver 3', 10: 'Gold 1', 11: 'Gold 2', 12: 'Gold 3',
  13: 'Platinum 1', 14: 'Platinum 2', 15: 'Platinum 3', 16: 'Diamond 1', 17: 'Diamond 2', 18: 'Diamond 3',
  19: 'Ascendant 1', 20: 'Ascendant 2', 21: 'Ascendant 3', 22: 'Immortal 1', 23: 'Immortal 2', 24: 'Immortal 3', 25: 'Radiant'
};

const rankEmoji = {
  unrated: '◇', iron: '⬟', bronze: '⬢', silver: '◆', gold: '✦', platinum: '✧', diamond: '✹', ascendant: '✚', immortal: '✷', radiant: '✺'
};

const els = {
  list: document.getElementById('list'), leaderboard: document.getElementById('leaderboardList'), stats: document.getElementById('stats'),
  searchInput: document.getElementById('searchInput'), onlyWithRank: document.getElementById('onlyWithRank'), onlyErrors: document.getElementById('onlyErrors'),
  refreshBtn: document.getElementById('refreshBtn'), clearBtn: document.getElementById('clearBtn'), template: document.getElementById('cardTemplate'),
  heroAccounts: document.getElementById('heroAccounts'), heroLoaded: document.getElementById('heroLoaded'), heroBest: document.getElementById('heroBest'),
  syncText: document.getElementById('syncText'), syncMeter: document.getElementById('syncMeter')
};

const state = loadState();
let accounts = [];
let lastPublicUpdate = null;

function loadState() { try { return { ...DEFAULT_STATE, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}) }; } catch { return { ...DEFAULT_STATE }; } }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function prettyDate(value) { if (!value) return 'SIN ACTUALIZAR'; return new Date(value).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
function currentData(data) { return data?.current || data?.current_data || {}; }
function rankName(data) {
  const current = currentData(data);
  if (current.tier?.name) return current.tier.name;
  if (current.currenttier_patched) return current.currenttier_patched;
  if (typeof current.currenttier === 'number') return tierNames[current.currenttier] || `Tier ${current.currenttier}`;
  return 'Sin datos';
}
function rrValue(data) {
  const current = currentData(data);
  if (typeof current.rr === 'number') return current.rr;
  if (typeof current.ranking_in_tier === 'number') return current.ranking_in_tier;
  return null;
}
function tierNumber(data) {
  const current = currentData(data);
  if (typeof current.currenttier === 'number') return current.currenttier;
  const name = rankName(data).toLowerCase();
  const entry = Object.entries(tierNames).find(([, v]) => v.toLowerCase() === name);
  return entry ? Number(entry[0]) : 0;
}
function rankScore(account) { return tierNumber(account.data) * 100 + (rrValue(account.data) || 0); }
function rankClass(data) {
  const name = rankName(data).toLowerCase();
  if (name.includes('radiant')) return 'rank-radiant';
  if (name.includes('immortal')) return 'rank-immortal';
  if (name.includes('ascendant')) return 'rank-ascendant';
  if (name.includes('diamond')) return 'rank-diamond';
  if (name.includes('platinum')) return 'rank-platinum';
  if (name.includes('gold')) return 'rank-gold';
  if (name.includes('silver')) return 'rank-silver';
  if (name.includes('bronze')) return 'rank-bronze';
  if (name.includes('iron')) return 'rank-iron';
  return 'rank-unrated';
}
function rankSymbol(data) {
  const cls = rankClass(data).replace('rank-', '');
  return rankEmoji[cls] || '◇';
}
function statusLabel(item) {
  if (item.error) return { text: 'ERROR', cls: 'error' };
  if (item.data) return { text: 'ONLINE', cls: 'ok' };
  return { text: 'PENDING', cls: 'loading' };
}
function filteredAccounts() {
  const query = state.search.trim().toLowerCase();
  return accounts.filter(account => {
    const text = `${account.name}#${account.tag} ${rankName(account.data)}`.toLowerCase();
    return (!query || text.includes(query)) && (!state.onlyWithRank || !!account.data) && (!state.onlyErrors || !!account.error);
  });
}
function bestAccount() { return accounts.filter(a => a.data).sort((a,b) => rankScore(b) - rankScore(a))[0] || null; }

function renderStats() {
  const total = accounts.length;
  const loaded = accounts.filter(a => a.data).length;
  const best = bestAccount();
  els.heroAccounts.textContent = total;
  els.heroLoaded.textContent = loaded;
  els.heroBest.textContent = best ? rankName(best.data).split(' ')[0] : '--';
  els.syncText.textContent = `LAST SYNC: ${prettyDate(lastPublicUpdate)}`;
  els.syncMeter.style.width = `${total ? Math.round((loaded / total) * 100) : 0}%`;
}

function renderLeaderboard() {
  const top = accounts.filter(a => a.data).sort((a,b) => rankScore(b) - rankScore(a)).slice(0, 5);
  els.leaderboard.innerHTML = top.length ? '' : '<p>Aún no hay rangos cargados.</p>';
  top.forEach((account, index) => {
    const row = document.createElement('div');
    row.className = `personal-row ${rankClass(account.data)}`;
    row.innerHTML = `
      <div>
        <strong>#${index + 1} ${account.name}<span>#${account.tag}</span></strong><br>
        <small>${(account.region || 'eu').toUpperCase()} · ${(account.playlist || 'competitive').toUpperCase()}</small>
      </div>
      <div style="text-align:right">
        <strong>${rankName(account.data)}</strong><br>
        <small>${rrValue(account.data) ?? '—'} RR</small>
      </div>`;
    els.leaderboard.appendChild(row);
  });
}

function renderAccounts() {
  const filtered = filteredAccounts();
  renderStats();
  renderLeaderboard();
  els.list.innerHTML = filtered.length ? '' : '<p>No hay cuentas que coincidan con ese filtro.</p>';
  filtered.forEach(account => {
    const node = els.template.content.cloneNode(true);
    const article = node.querySelector('.val-card');
    const status = statusLabel(account);
    
    node.querySelector('.player').textContent = `${account.name}#${account.tag}`;
    node.querySelector('.meta').textContent = `${(account.region || 'eu').toUpperCase()} · ${(account.platform || 'pc').toUpperCase()}`;
    
    const statusEl = node.querySelector('.status');
    statusEl.textContent = status.text;
    statusEl.style.color = status.cls === 'ok' ? '#6fffd0' : '#ff4655';
    
    node.querySelector('.rank-icon').textContent = rankSymbol(account.data);
    node.querySelector('.rank').textContent = account.error ? 'SIN RANGO' : rankName(account.data);
    node.querySelector('.rr').textContent = account.error ? '—' : `${rrValue(account.data) ?? '—'}`;
    node.querySelector('.score').textContent = account.data ? rankScore(account) : '—';
    node.querySelector('.tracker').href = account.tracker || `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${account.name}#${account.tag}`)}/overview`;
    node.querySelector('.raw').textContent = account.data ? JSON.stringify(account.data, null, 2) : account.error ? String(account.error) : 'Sin datos todavía.';
    node.querySelector('.refresh-card').addEventListener('click', forcePublicRefresh);
    els.list.appendChild(node);
  });
}

async function loadPublicRanks() {
  els.list.innerHTML = '<p>Sincronizando caché del servidor...</p>';
  const response = await fetch('/api/public-ranks');
  const payload = await response.json();
  lastPublicUpdate = payload.updatedAt || null;
  if (!response.ok || payload.error) { els.list.innerHTML = `<p>${payload.error || 'No se pudieron cargar los rangos.'}</p>`; return; }
  accounts = (payload.results || []).map(result => ({ ...result.account, data: result.ok ? result.data : null, error: result.ok ? null : result.error || 'Error', loading: false }));
  renderAccounts();
}

async function forcePublicRefresh() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = 'SYNC...';
  try {
    const response = await fetch('/api/public-ranks/refresh', { method: 'POST' });
    const payload = await response.json();
    lastPublicUpdate = payload.updatedAt || null;
    accounts = (payload.results || []).map(result => ({ ...result.account, data: result.ok ? result.data : null, error: result.ok ? null : result.error, loading: false }));
    renderAccounts();
  } catch (error) { els.list.innerHTML = `<p>Error: ${error.message}</p>`; }
  finally { els.refreshBtn.disabled = false; els.refreshBtn.textContent = 'FORZAR SYNC'; }
}

function bindInputs() {
  if(els.searchInput) {
    els.searchInput.value = state.search;
    els.searchInput.addEventListener('input', () => { state.search = els.searchInput.value; saveState(); renderAccounts(); });
  }
  if(els.onlyWithRank){
    els.onlyWithRank.checked = state.onlyWithRank;
    els.onlyWithRank.addEventListener('change', () => { state.onlyWithRank = els.onlyWithRank.checked; saveState(); renderAccounts(); });
  }
  if(els.onlyErrors){
    els.onlyErrors.checked = state.onlyErrors;
    els.onlyErrors.addEventListener('change', () => { state.onlyErrors = els.onlyErrors.checked; saveState(); renderAccounts(); });
  }
  if(els.refreshBtn) els.refreshBtn.addEventListener('click', forcePublicRefresh);
  if(els.clearBtn) els.clearBtn.addEventListener('click', () => { state.search = ''; state.onlyWithRank = false; state.onlyErrors = false; saveState(); location.reload(); });
}

async function init() { bindInputs(); await loadPublicRanks(); }
init();