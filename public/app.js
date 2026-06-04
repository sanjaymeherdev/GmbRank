// ============================================================
// GBP RANK TRACKER — FRONTEND SPA
// ============================================================

const API = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get:    (path)        => API.request('GET',    path),
  post:   (path, body)  => API.request('POST',   path, body),
  put:    (path, body)  => API.request('PUT',    path, body),
  delete: (path)        => API.request('DELETE', path),
};

// ── State ──────────────────────────────────────────────────
const state = {
  user: null,
  businesses: [],
  // Home dropdowns
  home: { bizId: null, locId: null, ksetId: null, editKsetId: null },
  // Check dropdowns
  check: { bizId: null, ksetId: null, date: null },
  // Stats dropdowns
  stats: { bizId: null, ksetId: null },
};

// ── DOM Helpers ────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const setStatus = (id, msg, type = '') => {
  const el = $(id);
  el.textContent = msg;
  el.className = 'status-bar ' + type;
};

function posClass(pos) {
  if (!pos) return 'pos-nf';
  if (pos === 1) return 'pos-1';
  if (pos <= 3)  return 'pos-3';
  if (pos <= 10) return 'pos-10';
  if (pos <= 20) return 'pos-20';
  return 'pos-nf';
}
function posLabel(pos) { return pos ? String(pos) : 'NF'; }
function trendClass(t) {
  if (t === '↑') return 'trend-up';
  if (t === '↓') return 'trend-down';
  return 'trend-flat';
}

function populateSelect(selectEl, items, valueKey, labelKey, placeholder) {
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    selectEl.appendChild(opt);
  }
}

// ── Auth ───────────────────────────────────────────────────
async function checkAuth() {
  try {
    const { user } = await API.get('/auth/me');
    state.user = user;
    showApp();
  } catch {
    showAuth();
  }
}

function showAuth() {
  $('page-auth').classList.add('active');
  $('page-app').classList.remove('active');
}
function showApp() {
  $('page-auth').classList.remove('active');
  $('page-app').classList.add('active');
  $('sidebar-user').textContent = state.user.email;
  loadBusinesses();
}

// Auth tabs
document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
    tab.classList.add('active');
    $('form-' + tab.dataset.tab).classList.add('active');
  });
});

$('btn-login').addEventListener('click', async () => {
  $('login-error').textContent = '';
  try {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const { user } = await API.post('/auth/login', { email, password });
    state.user = user;
    showApp();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('btn-register').addEventListener('click', async () => {
  $('reg-error').textContent = '';
  try {
    const name = $('reg-name').value.trim();
    const email = $('reg-email').value.trim();
    const password = $('reg-password').value;
    const { user } = await API.post('/auth/register', { name, email, password });
    state.user = user;
    showApp();
  } catch (err) {
    $('reg-error').textContent = err.message;
  }
});

$('btn-logout').addEventListener('click', async () => {
  await API.post('/auth/logout');
  state.user = null;
  showAuth();
});

// ── Navigation ─────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    $('view-' + btn.dataset.view).classList.add('active');

    if (btn.dataset.view === 'check') initCheckView();
    if (btn.dataset.view === 'stats') initStatsView();
  });
});

// ── Business Loading ───────────────────────────────────────
async function loadBusinesses() {
  try {
    const { businesses } = await API.get('/businesses');
    state.businesses = businesses;
    populateSelect($('home-biz-dropdown'), businesses, 'id', 'name', 'Select Business');
    populateSelect($('check-biz-dropdown'), businesses, 'id', 'name', 'Select Business');
    populateSelect($('stats-biz-dropdown'), businesses, 'id', 'name', 'Select Business');
  } catch (err) {
    setStatus('home-status', '❌ Failed to load businesses: ' + err.message, 'err');
  }
}

// ── HOME VIEW ──────────────────────────────────────────────

// Save Business
$('btn-save-business').addEventListener('click', async () => {
  const name = $('home-business').value.trim();
  const location = $('home-location').value.trim();
  const kwText = $('home-keywords').value.trim();

  if (!name || !location || !kwText) {
    setStatus('home-status', '❌ Please fill in business name, location, and keywords', 'err');
    return;
  }
  const keywords = kwText.split('\n').map((k) => k.trim()).filter(Boolean);

  const btn = $('btn-save-business');
  btn.disabled = true;
  try {
    setStatus('home-status', '💾 Saving...', 'loading');

    const { business } = await API.post('/businesses', { name });
    const { location: loc } = await API.post(`/businesses/${business.id}/locations`, {
      location_string: location,
    });
    await API.post(`/locations/${loc.id}/keyword-sets`, { keywords });

    setStatus('home-status', '✅ Business saved successfully!', 'ok');
    await loadBusinesses();
    refreshHomeDropdowns();
  } catch (err) {
    setStatus('home-status', '❌ ' + err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

// Check Rankings
$('btn-check-rankings').addEventListener('click', async () => {
  const saveBtn = $('btn-save-business');
  const checkBtn = $('btn-check-rankings');
  saveBtn.disabled = true;
  checkBtn.disabled = true;

  try {
    let ksetId = state.home.ksetId;
    let keywordCount;

    if (ksetId) {
      // Already have a selected keyword set — skip saving entirely
      const { keyword_sets } = await API.get(`/locations/${state.home.locId}/keyword-sets`);
      const ks = keyword_sets.find((k) => k.id === ksetId);
      keywordCount = ks ? ks.keywords.length : '?';
    } else {
      // Nothing selected — save first, then check
      const name = $('home-business').value.trim();
      const location = $('home-location').value.trim();
      const kwText = $('home-keywords').value.trim();

      if (!name || !location || !kwText) {
        setStatus('home-status', '❌ Please fill in all fields or select a keyword set above', 'err');
        return;
      }
      const keywords = kwText.split('\n').map((k) => k.trim()).filter(Boolean);
      keywordCount = keywords.length;

      $('home-status').className = 'status-bar loading';
      $('home-status').innerHTML = '<span class="spinner"></span> Saving business data...';

      const { business } = await API.post('/businesses', { name });
      const { location: loc } = await API.post(`/businesses/${business.id}/locations`, {
        location_string: location,
      });
      const { keyword_set } = await API.post(`/locations/${loc.id}/keyword-sets`, { keywords });
      ksetId = keyword_set.id;
    }

    $('home-status').className = 'status-bar loading';
    $('home-status').innerHTML = `<span class="spinner"></span> Checking rankings for ${keywordCount} keyword(s)… this takes 2–5 minutes, please wait.`;

    const result = await API.post(`/keyword-sets/${ksetId}/check`, {});
    setStatus('home-status',
      `✅ Done! Checked ${result.keywordsChecked} keywords. Go to Rank Check to view results.`, 'ok');
    await loadBusinesses();
    refreshHomeDropdowns();
  } catch (err) {
    setStatus('home-status', '❌ ' + err.message, 'err');
  } finally {
    saveBtn.disabled = false;
    checkBtn.disabled = false;
  }
});

// Clear form
$('btn-clear-form').addEventListener('click', () => {
  $('home-business').value = '';
  $('home-location').value = '';
  $('home-keywords').value = '';
  setStatus('home-status', '', '');
});

// Home: business dropdown cascades
$('home-biz-dropdown').addEventListener('change', async (e) => {
  state.home.bizId = e.target.value || null;
  state.home.locId = null;
  state.home.ksetId = null;

  const locDrop = $('home-loc-dropdown');
  const ksetDrop = $('home-kset-dropdown');
  locDrop.innerHTML = '<option value="">Select Location</option>';
  locDrop.disabled = true;
  ksetDrop.innerHTML = '<option value="">Select Keyword Set</option>';
  ksetDrop.disabled = true;
  $('home-kw-display').textContent = '';

  if (!state.home.bizId) return;

  try {
    const { locations } = await API.get(`/businesses/${state.home.bizId}/locations`);
    populateSelect(locDrop, locations, 'id', 'location_string', 'Select Location');
    locDrop.disabled = false;
  } catch (err) {
    setStatus('home-manage-status', '❌ ' + err.message, 'err');
  }
});

$('home-loc-dropdown').addEventListener('change', async (e) => {
  state.home.locId = e.target.value || null;
  state.home.ksetId = null;
  const ksetDrop = $('home-kset-dropdown');
  ksetDrop.innerHTML = '<option value="">Select Keyword Set</option>';
  ksetDrop.disabled = true;
  $('home-kw-display').textContent = '';

  if (!state.home.locId) return;

  try {
    const { keyword_sets } = await API.get(`/locations/${state.home.locId}/keyword-sets`);
    populateSelect(ksetDrop, keyword_sets, 'id', 'set_name', 'Select Keyword Set');
    ksetDrop.disabled = false;
  } catch (err) {
    setStatus('home-manage-status', '❌ ' + err.message, 'err');
  }
});

$('home-kset-dropdown').addEventListener('change', (e) => {
  state.home.ksetId = e.target.value || null;
  if (!state.home.ksetId) { $('home-kw-display').textContent = ''; return; }

  // Find keywords from the select option text is not practical; re-fetch
  API.get(`/locations/${state.home.locId}/keyword-sets`).then(({ keyword_sets }) => {
    const ks = keyword_sets.find((k) => k.id === state.home.ksetId);
    if (ks) $('home-kw-display').textContent = ks.keywords.join('\n');
  });
});

// Load into form
$('btn-load-data').addEventListener('click', async () => {
  if (!state.home.ksetId || !state.home.locId || !state.home.bizId) {
    setStatus('home-manage-status', '❌ Please select business, location, and keyword set', 'err');
    return;
  }
  try {
    const biz = state.businesses.find((b) => b.id === state.home.bizId);
    const { locations } = await API.get(`/businesses/${state.home.bizId}/locations`);
    const loc = locations.find((l) => l.id === state.home.locId);
    const { keyword_sets } = await API.get(`/locations/${state.home.locId}/keyword-sets`);
    const ks = keyword_sets.find((k) => k.id === state.home.ksetId);

    $('home-business').value = biz?.name || '';
    $('home-location').value = loc?.location_string || '';
    $('home-keywords').value = ks?.keywords.join('\n') || '';
    setStatus('home-manage-status', '✅ Data loaded into form', 'ok');
  } catch (err) {
    setStatus('home-manage-status', '❌ ' + err.message, 'err');
  }
});

// Edit Keywords (inline, just updates keyword set)
$('btn-edit-kw').addEventListener('click', () => {
  if (!state.home.ksetId) {
    setStatus('home-manage-status', '❌ Select a keyword set first', 'err');
    return;
  }
  const current = $('home-kw-display').textContent;
  const newKw = prompt('Edit keywords (one per line):', current);
  if (newKw === null) return; // cancelled
  const keywords = newKw.split('\n').map((k) => k.trim()).filter(Boolean);
  if (!keywords.length) { setStatus('home-manage-status', '❌ Keywords cannot be empty', 'err'); return; }

  API.put(`/keyword-sets/${state.home.ksetId}`, { keywords }).then(() => {
    $('home-kw-display').textContent = keywords.join('\n');
    setStatus('home-manage-status', '✅ Keywords updated', 'ok');
  }).catch((err) => setStatus('home-manage-status', '❌ ' + err.message, 'err'));
});

// Delete actions
$('btn-delete-biz').addEventListener('click', async () => {
  if (!state.home.bizId) { setStatus('home-manage-status', '❌ Select a business first', 'err'); return; }
  if (!confirm('Delete this business and ALL its data?')) return;
  try {
    await API.delete(`/businesses/${state.home.bizId}`);
    setStatus('home-manage-status', '✅ Business deleted', 'ok');
    await loadBusinesses();
    refreshHomeDropdowns();
  } catch (err) { setStatus('home-manage-status', '❌ ' + err.message, 'err'); }
});

$('btn-delete-loc').addEventListener('click', async () => {
  if (!state.home.locId) { setStatus('home-manage-status', '❌ Select a location first', 'err'); return; }
  if (!confirm('Delete this location and all its keyword sets?')) return;
  try {
    await API.delete(`/locations/${state.home.locId}`);
    setStatus('home-manage-status', '✅ Location deleted', 'ok');
    $('home-loc-dropdown').dispatchEvent(new Event('change')); // reset downstream
  } catch (err) { setStatus('home-manage-status', '❌ ' + err.message, 'err'); }
});

$('btn-delete-kset').addEventListener('click', async () => {
  if (!state.home.ksetId) { setStatus('home-manage-status', '❌ Select a keyword set first', 'err'); return; }
  if (!confirm('Delete this keyword set and all its ranking history?')) return;
  try {
    await API.delete(`/keyword-sets/${state.home.ksetId}`);
    setStatus('home-manage-status', '✅ Keyword set deleted', 'ok');
    $('home-kset-dropdown').innerHTML = '<option value="">Select Keyword Set</option>';
    $('home-kset-dropdown').disabled = true;
    $('home-kw-display').textContent = '';
    state.home.ksetId = null;
  } catch (err) { setStatus('home-manage-status', '❌ ' + err.message, 'err'); }
});

function refreshHomeDropdowns() {
  $('home-biz-dropdown').value = '';
  $('home-loc-dropdown').innerHTML = '<option value="">Select Location</option>';
  $('home-loc-dropdown').disabled = true;
  $('home-kset-dropdown').innerHTML = '<option value="">Select Keyword Set</option>';
  $('home-kset-dropdown').disabled = true;
  $('home-kw-display').textContent = '';
  state.home = { bizId: null, locId: null, ksetId: null };
}

// ── RANK CHECK VIEW ────────────────────────────────────────
function initCheckView() {
  setStatus('check-status', '', '');
  $('check-summary').textContent = '';
  $('check-results').innerHTML = '';
}

$('check-biz-dropdown').addEventListener('change', async (e) => {
  state.check.bizId = e.target.value || null;
  state.check.ksetId = null;
  state.check.date = null;

  const ksetDrop = $('check-kset-dropdown');
  const dateDrop = $('check-date-dropdown');
  ksetDrop.innerHTML = '<option value="">Select Keyword Set</option>';
  ksetDrop.disabled = true;
  dateDrop.innerHTML = '<option value="">Select Date</option>';
  dateDrop.disabled = true;
  $('btn-get-rank').disabled = true;

  if (!state.check.bizId) return;

  try {
    // Get all locations then all keyword sets for this business
    const { locations } = await API.get(`/businesses/${state.check.bizId}/locations`);
    const allSets = [];
    for (const loc of locations) {
      const { keyword_sets } = await API.get(`/locations/${loc.id}/keyword-sets`);
      for (const ks of keyword_sets) {
        allSets.push({ id: ks.id, set_name: `${loc.location_string} — ${ks.set_name}` });
      }
    }
    populateSelect(ksetDrop, allSets, 'id', 'set_name', 'Select Keyword Set');
    ksetDrop.disabled = false;
  } catch (err) {
    setStatus('check-status', '❌ ' + err.message, 'err');
  }
});

$('check-kset-dropdown').addEventListener('change', async (e) => {
  state.check.ksetId = e.target.value || null;
  state.check.date = null;
  const dateDrop = $('check-date-dropdown');
  dateDrop.innerHTML = '<option value="">Select Date</option>';
  dateDrop.disabled = true;
  $('btn-get-rank').disabled = true;

  if (!state.check.ksetId) return;

  try {
    setStatus('check-status', 'Loading dates...', 'loading');
    const { dates } = await API.get(`/keyword-sets/${state.check.ksetId}/dates`);
    if (!dates.length) {
      setStatus('check-status', 'No ranking history yet. Run a check first.', '');
      return;
    }
    populateSelect(dateDrop, dates, 'date', 'display', 'Select Date');
    dateDrop.disabled = false;
    setStatus('check-status', '', '');
  } catch (err) {
    setStatus('check-status', '❌ ' + err.message, 'err');
  }
});

$('check-date-dropdown').addEventListener('change', (e) => {
  state.check.date = e.target.value || null;
  $('btn-get-rank').disabled = !state.check.date;
});

$('btn-get-rank').addEventListener('click', async () => {
  try {
    setStatus('check-status', 'Fetching rankings...', 'loading');
    $('check-results').innerHTML = '';
    $('check-summary').textContent = '';

    const data = await API.get(
      `/keyword-sets/${state.check.ksetId}/results?date=${state.check.date}`
    );

    $('check-summary').innerHTML = `
      <strong>${data.business}</strong> &nbsp;·&nbsp; ${data.location}<br/>
      Set: <strong>${data.setName}</strong> &nbsp;·&nbsp; Date: <strong>${state.check.date}</strong>
      &nbsp;·&nbsp; ${data.totalKeywords} keywords
    `;

    renderRankTable(data.results);
    setStatus('check-status', '✅ Rankings loaded', 'ok');
  } catch (err) {
    setStatus('check-status', '❌ ' + err.message, 'err');
  }
});

function renderRankTable(results) {
  if (!results.length) {
    $('check-results').innerHTML = '<p style="color:var(--text-muted);padding:12px">No data for this date.</p>';
    return;
  }

  const rows = results.map((r, i) => `
    <tr>
      <td style="color:var(--text-muted);font-family:var(--font-mono)">${i + 1}</td>
      <td class="kw-cell">${r.keyword}</td>
      <td><span class="pos-badge ${posClass(r.currentPosition)}">${posLabel(r.currentPosition)}</span></td>
      <td>${r.businessTitle || '—'}</td>
      <td>${r.address || '—'}</td>
      <td>${r.rating || '—'}</td>
      <td>${r.reviews || '—'}</td>
    </tr>
  `).join('');

  $('check-results').innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th>#</th><th>Keyword</th><th>Position</th>
          <th>Business Title</th><th>Address</th><th>Rating</th><th>Reviews</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── STATS VIEW ─────────────────────────────────────────────
function initStatsView() {
  setStatus('stats-status', '', '');
  $('stats-summary').textContent = '';
  $('stats-results').innerHTML = '';
}

$('stats-biz-dropdown').addEventListener('change', async (e) => {
  state.stats.bizId = e.target.value || null;
  state.stats.ksetId = null;
  const ksetDrop = $('stats-kset-dropdown');
  ksetDrop.innerHTML = '<option value="">Select Keyword Set</option>';
  ksetDrop.disabled = true;
  $('btn-get-stats').disabled = true;

  if (!state.stats.bizId) return;

  try {
    const { locations } = await API.get(`/businesses/${state.stats.bizId}/locations`);
    const allSets = [];
    for (const loc of locations) {
      const { keyword_sets } = await API.get(`/locations/${loc.id}/keyword-sets`);
      for (const ks of keyword_sets) {
        allSets.push({ id: ks.id, set_name: `${loc.location_string} — ${ks.set_name}` });
      }
    }
    populateSelect(ksetDrop, allSets, 'id', 'set_name', 'Select Keyword Set');
    ksetDrop.disabled = false;
  } catch (err) {
    setStatus('stats-status', '❌ ' + err.message, 'err');
  }
});

$('stats-kset-dropdown').addEventListener('change', (e) => {
  state.stats.ksetId = e.target.value || null;
  $('btn-get-stats').disabled = !state.stats.ksetId;
});

$('btn-get-stats').addEventListener('click', async () => {
  try {
    setStatus('stats-status', 'Loading statistics...', 'loading');
    $('stats-results').innerHTML = '';
    $('stats-summary').textContent = '';

    const data = await API.get(`/keyword-sets/${state.stats.ksetId}/stats`);

    $('stats-summary').innerHTML = `
      <strong>${data.business}</strong> &nbsp;·&nbsp; Set: <strong>${data.setName}</strong>
      &nbsp;·&nbsp; ${data.totalKeywords} keywords tracked
    `;

    renderStatsTable(data.stats);
    setStatus('stats-status', '✅ Statistics loaded', 'ok');
  } catch (err) {
    setStatus('stats-status', '❌ ' + err.message, 'err');
  }
});

function renderStatsTable(stats) {
  if (!stats.length) {
    $('stats-results').innerHTML = '<p style="color:var(--text-muted);padding:12px">No stats yet. Run a rank check first.</p>';
    return;
  }

  const rows = stats.map((s) => `
    <tr>
      <td class="kw-cell">${s.keyword}</td>
      <td><span class="pos-badge ${posClass(s.currentPosition)}">${posLabel(s.currentPosition)}</span></td>
      <td><span class="pos-badge ${posClass(s.bestPosition)}">${posLabel(s.bestPosition)}</span></td>
      <td><span class="pos-badge ${posClass(s.worstPosition)}">${posLabel(s.worstPosition)}</span></td>
      <td style="font-family:var(--font-mono)">${s.avgPosition ?? '—'}</td>
      <td><span class="trend ${trendClass(s.trend)}">${s.trend}</span></td>
      <td style="color:var(--text-muted)">${s.totalChecks}</td>
      <td style="color:var(--text-muted);font-size:12px">${s.lastChecked ? new Date(s.lastChecked).toLocaleDateString() : '—'}</td>
    </tr>
  `).join('');

  $('stats-results').innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Keyword</th><th>Current</th><th>Best</th><th>Worst</th>
          <th>Avg</th><th>Trend</th><th>Checks</th><th>Last Checked</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Init ───────────────────────────────────────────────────
checkAuth();
