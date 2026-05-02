// ── State ────────────────────────────────────────────────────
const S = {
  token: localStorage.getItem('token'),
  userEmail: localStorage.getItem('userEmail') || '',
  page: 'overview',
  pollTimer: null,
  /** When false, shifts list uses Profile city + min pay filters */
  shiftsShowAll: false,
};

// ── API ──────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  
  if (res.status === 401) {
    logout();
    throw new Error("Session expired or user deleted. Please log in again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `HTTP ${res.status}`);
  return data;
}

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  let c = document.getElementById('toasts');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toasts';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Auth ─────────────────────────────────────────────────────
async function handleAuth(mode) {
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('password').value.trim();
  if (!email || !pass) return toast('Fill in all fields', 'error');
  const btn = document.getElementById('auth-btn');
  btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    const data = await api('POST', `/api/auth/${mode}`, { email, password: pass });
    S.token     = data.token;
    S.userEmail = email;
    localStorage.setItem('token', data.token);
    localStorage.setItem('userEmail', email);
    toast('Logged in!');
    render();
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function logout() {
  S.token = null; S.userEmail = '';
  localStorage.clear();
  clearInterval(S.pollTimer);
  render();
}

// ── Navigation ───────────────────────────────────────────────
function nav(page) {
  S.page = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.getElementById('page-title').textContent = {
    overview: 'Overview',
    bot:      'Bot Control',
    shifts:   'Shifts',
    profile:  'Profile',
  }[page] || page;
  renderPage();
}

// ── Render Root ──────────────────────────────────────────────
function render() {
  if (!S.token) { renderAuth(); return; }
  renderShell();
  nav('overview');
  startPolling();
}

// ── Auth Page ────────────────────────────────────────────────
function renderAuth(mode = 'login') {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon">🤖</div>
          <div>
            <h1>ShiftBot</h1>
            <span>Amazon Automation</span>
          </div>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab ${mode==='login'?'active':''}" onclick="renderAuth('login')">Sign In</button>
          <button class="auth-tab ${mode==='register'?'active':''}" onclick="renderAuth('register')">Register</button>
        </div>
        <h2>${mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <p>${mode === 'login' ? 'Sign in to manage your bot.' : 'Get started in seconds.'}</p>
        <div class="form-group">
          <label>Email</label>
          <input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input id="password" type="password" placeholder="••••••••"
            onkeydown="if(event.key==='Enter') handleAuth('${mode}')" />
        </div>
        <button id="auth-btn" class="btn btn-primary btn-full" onclick="handleAuth('${mode}')">
          ${mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </div>
    </div>`;
}

// ── App Shell ────────────────────────────────────────────────
function renderShell() {
  const initials = S.userEmail?.[0]?.toUpperCase() || '?';
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">🤖</div>
          <span>ShiftBot</span>
        </div>
        <div class="nav-section-label">Main</div>
        ${navItem('overview','📊','Overview')}
        ${navItem('bot','⚡','Bot Control')}
        ${navItem('shifts','📋','Shifts')}
        <div class="nav-section-label">Settings</div>
        ${navItem('profile','👤','Profile')}
        <div class="sidebar-bottom">
          <div class="user-card">
            <div class="user-avatar">${initials}</div>
            <div class="user-info">
              <div class="user-email">${S.userEmail}</div>
              <div class="user-role">Bot User</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-full btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </nav>
      <div class="main">
        <div class="topbar">
          <h2 id="page-title">Overview</h2>
          <div class="topbar-right">
            <span id="bot-status-pill" class="badge-pill badge-gray">● Bot Idle</span>
          </div>
        </div>
        <div class="content fade-in" id="content"></div>
      </div>
    </div>`;
}

function navItem(page, icon, label) {
  return `<div class="nav-item" data-page="${page}" onclick="nav('${page}')">
    <span class="nav-icon">${icon}</span>${label}
  </div>`;
}

// ── Page Renderers ───────────────────────────────────────────

// OVERVIEW
async function renderPage() {
  const el = document.getElementById('content');
  el.className = 'content fade-in';
  switch (S.page) {
    case 'overview': await pageOverview(el); break;
    case 'bot':      await pageBot(el);      break;
    case 'shifts':   await pageShifts(el);   break;
    case 'profile':  await pageProfile(el);  break;
  }
}

async function pageOverview(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading...</div>`;
  try {
    const bot = await api('GET', '/api/bot/status').catch(() => ({ running: false }));
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card ${bot.running ? 'green' : 'blue'}">
          <div class="stat-label">Bot Status</div>
          <div class="stat-value">${bot.running ? '🟢' : '⚫'}</div>
          <div class="stat-sub">${bot.running ? `Running · every ${bot.intervalSeconds < 60 ? bot.intervalSeconds + 's' : (bot.intervalSeconds/60) + 'm'}` : 'Stopped'}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Shifts Found</div>
          <div class="stat-value">${bot.lastShiftsFound ?? '—'}</div>
          <div class="stat-sub">Last scan</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Last Scan</div>
          <div class="stat-value" style="font-size:16px">${bot.lastRun ? new Date(bot.lastRun).toLocaleTimeString() : '—'}</div>
          <div class="stat-sub">${bot.lastRun ? new Date(bot.lastRun).toLocaleDateString() : 'Never'}</div>
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Quick Actions</div>
          <div class="stack">
            <button class="btn btn-primary" onclick="nav('bot')">${bot.running ? '⚡ Manage Bot' : '▶ Start Bot'}</button>
            <button class="btn btn-secondary" onclick="nav('shifts')">📋 View Shifts</button>
            <button class="btn btn-secondary" onclick="nav('profile')">👤 Edit Profile</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Bot Details</div>
          ${bot.running ? `
            <div class="token-row"><span class="token-key">Status</span><span class="badge-pill badge-green">● Running</span></div>
            <div class="token-row"><span class="token-key">Interval</span><span class="token-value">${bot.intervalSeconds < 60 ? bot.intervalSeconds + ' seconds' : (bot.intervalSeconds/60) + ' min'}</span></div>
            <div class="token-row"><span class="token-key">Started</span><span class="token-value">${new Date(bot.startedAt).toLocaleTimeString()}</span></div>
            <div class="token-row"><span class="token-key">Shifts (last)</span><span class="token-value">${bot.lastShiftsFound}</span></div>
          ` : `
            <div class="empty-state" style="padding:24px">
              <div class="empty-icon">🤖</div>
              <h4>Bot is not running</h4>
              <p>Go to Bot Control to start scanning.</p>
            </div>`}
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>Error loading overview: ${e.message}</p></div>`;
  }
}

async function pageBot(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading...</div>`;
  try {
    const status = await api('GET', '/api/bot/status').catch(() => ({ running: false }));
    const state  = status.running ? 'running' : status.lastError ? 'error' : 'idle';
    el.innerHTML = `
      <div class="bot-status-banner ${state}">
        <div class="bot-status-left">
          <div class="pulse-dot"></div>
          <div>
            <div class="bot-status-label">${status.running ? 'Bot Running' : 'Bot Stopped'}</div>
            <div class="bot-status-sub">${status.running
              ? `Scanning every ${status.intervalSeconds < 60 ? status.intervalSeconds + 's' : (status.intervalSeconds/60) + 'm'} · Last scan: ${status.lastRun ? new Date(status.lastRun).toLocaleTimeString() : 'pending'}`
              : status.lastError ? `Last error: ${status.lastError}` : 'Click Start to begin scanning'
            }</div>
          </div>
        </div>
        <div class="bot-controls">
          ${!status.running ? `
          <div class="interval-selector">
            <label>Every</label>
            <select id="bot-interval">
              <option value="1">1 second</option>
              <option value="2">2 seconds</option>
              <option value="5">5 seconds</option>
              <option value="60">1 min</option>
              <option value="300" ${!status.intervalSeconds || status.intervalSeconds===300?'selected':''}>5 min</option>
              <option value="600" ${status.intervalSeconds===600?'selected':''}>10 min</option>
            </select>
          </div>` : ''}
          ${status.running
            ? `<button class="btn btn-danger" onclick="botStop()">⏹ Stop Bot</button>`
            : `<button class="btn btn-primary" onclick="botStart()">▶ Start Bot</button>`}
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Last Scan Results</div>
          ${status.lastRun ? `
            <div class="token-row"><span class="token-key">Time</span><span class="token-value">${new Date(status.lastRun).toLocaleString()}</span></div>
            <div class="token-row"><span class="token-key">Shifts Found</span><span class="token-value">${status.lastShiftsFound}</span></div>
            <div class="token-row"><span class="token-key">Status</span>
              <span class="badge-pill ${status.lastError ? 'badge-red' : 'badge-green'}">${status.lastError ? '❌ Error' : '✅ Success'}</span>
            </div>
            ${status.lastAutoApply ? `<div class="token-row"><span class="token-key">Auto-Apply</span><span class="token-value">✅ ${status.lastAutoApply.claimed} · ⚠️ ${status.lastAutoApply.taken} · ❌ ${status.lastAutoApply.failed}</span></div>` : ''}
            ${status.lastError ? `<div class="token-row"><span class="token-key">Error</span><span class="token-value" style="color:var(--danger);font-size:11px">${status.lastError}</span></div>` : ''}
          ` : `<div class="empty-state" style="padding:20px"><p>No scans run yet.</p></div>`}
        </div>
        <div class="card">
          <div class="card-title">How It Works</div>
          <div class="stack" style="gap:12px">
            ${['🔑 Uses your stored Amazon token — no re-login', '📧 If token expires, refreshes silently', '📦 Saves found shifts to database', '🤖 Auto-apply (optional) retries failed claims', '🔔 Telegram when new shifts match Profile city + min pay'].map(s=>
              `<div style="font-size:13px;color:var(--text2)">${s}</div>`).join('')}
          </div>
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function botStart() {
  const interval = parseInt(document.getElementById('bot-interval')?.value) || 300;
  try {
    await api('POST', '/api/bot/start', { intervalSeconds: interval });
    toast(`Bot started — scanning every ${interval} seconds`);
    pageBot(document.getElementById('content'));
    updateBotPill(true);
  } catch(e) { toast(e.message, 'error'); }
}

async function botStop() {
  try {
    await api('POST', '/api/bot/stop');
    toast('Bot stopped');
    pageBot(document.getElementById('content'));
    updateBotPill(false);
  } catch(e) { toast(e.message, 'error'); }
}

async function pageShifts(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading shifts...</div>`;
  try {
    const data = await api('POST', '/api/shifts/get-shifts', { showAll: S.shiftsShowAll });
    const shifts = data.shifts ?? [];
    const meta = data.meta ?? {};
    const filterHint = meta.filtersApplied
      ? ` · Matching ${meta.city ? meta.city : 'any city'}${meta.minPay != null ? ` · ≥ $${meta.minPay}/hr` : ''}`
      : S.shiftsShowAll ? ' · Showing all' : '';
    el.innerHTML = `
      <div class="section-header">
        <h3>Available Shifts <span style="color:var(--text3);font-size:13px;font-weight:400">${shifts.length} found${filterHint}</span></h3>
        <div class="section-actions shifts-toolbar">
          <label class="toggle-filter">
            <input type="checkbox" ${S.shiftsShowAll ? 'checked' : ''} onchange="toggleShiftsShowAll(this.checked)" />
            <span>Show all shifts</span>
          </label>
          <button class="btn btn-secondary btn-sm" onclick="pageShifts(document.getElementById('content'))">🔄 Refresh</button>
        </div>
      </div>`;
    if (!shifts.length) {
      el.innerHTML += `<div class="empty-state"><div class="empty-icon">📋</div><h4>No shifts ${meta.filtersApplied ? 'match your filters' : 'yet'}</h4><p>${meta.filtersApplied ? 'Try “Show all shifts” or adjust city / min pay in Profile.' : 'Start the bot to scan for available shifts.'}</p></div>`;
    } else {
      el.innerHTML += `<div class="shifts-grid">${shifts.map(shiftCard).join('')}</div>`;
    }
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h4>Error</h4><p>${e.message}</p></div>`;
  }
}

function toggleShiftsShowAll(showAll) {
  S.shiftsShowAll = !!showAll;
  pageShifts(document.getElementById('content'));
}

function shiftCard(s) {
  return `
    <div class="shift-card">
      <div class="shift-card-header">
        <div class="shift-title">${s.title || 'Shift'}</div>
        <div class="shift-pay">${s.pay ? `$${s.pay}/hr` : '—'}</div>
      </div>
      <div class="shift-meta">
        <div class="shift-meta-row"><span class="icon">📍</span>${s.location || 'TBD'}</div>
        <div class="shift-meta-row"><span class="icon">🕐</span>${s.startTime || '—'} → ${s.endTime || s.time || '—'}</div>
      </div>
    </div>`;
}

async function pageProfile(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading profile…</div>`;
  try {
    const p = await api('GET', '/api/user/profile');
    const sessionSnippet =
`var data = { tokens: { ...localStorage }, cookies: document.cookie };
prompt("Copy this Session JSON and paste it into the Bot Dashboard:", JSON.stringify(data));`;
    el.innerHTML = `
    <div class="two-col">
      <div class="stack">
        <div class="card">
          <div class="card-title">Eligibility</div>
          <div class="form-group">
            <label>Visa / Residency Status</label>
            <select id="p-visa">
              <option value="citizen">Canadian Citizen</option>
              <option value="work_permit">Work Permit</option>
              <option value="student">Student</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div class="card-title" style="margin-top:8px">Documents</div>
          <div class="checkbox-group"><input type="checkbox" id="p-sin"><label for="p-sin">SIN (Social Insurance Number)</label></div>
          <div class="checkbox-group"><input type="checkbox" id="p-wp"><label for="p-wp">Work Permit</label></div>
        </div>
        <div class="card">
          <div class="card-title">Shift Filters</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Used on the Shifts page and for Telegram alerts when the bot finds new matching openings.</p>
          <div class="form-row">
            <div class="form-group"><label>City</label><input id="p-city" type="text" placeholder="e.g. Toronto" /></div>
            <div class="form-group"><label>Min Pay ($/hr)</label><input id="p-pay" type="number" step="0.01" placeholder="e.g. 18" /></div>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Preferred Timing</label>
            <select id="p-timing">
              <option value="flexible">Flexible (Any Time)</option>
              <option value="morning">Morning (6 AM - 12 PM)</option>
              <option value="afternoon">Afternoon (12 PM - 6 PM)</option>
              <option value="night">Night (6 PM - 12 AM)</option>
              <option value="overnight">Overnight (12 AM - 6 AM)</option>
            </select>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Telegram alerts</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Set <code>TELEGRAM_BOT_TOKEN</code> on the server. Message your bot, then paste your numeric chat ID here (from @userinfobot or similar).</p>
          <div class="form-group"><label>Telegram chat ID</label><input id="p-telegram" type="text" placeholder="e.g. 123456789" autocomplete="off" /></div>
        </div>
        <div class="card">
          <div class="card-title">Get Session JSON (easy copy)</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Open <code>hiring.amazon.ca</code> in your normal Chrome (already logged in), press <code>F12</code> → Console, paste this, then copy the popup JSON into “Session JSON Payload”.</p>
          <div class="form-group">
            <label>Console script</label>
            <textarea id="p-session-snippet" rows="3" readonly style="width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px; border-radius: 4px; font-family: monospace;"></textarea>
          </div>
          <button class="btn btn-secondary btn-full btn-sm" onclick="copySessionSnippet()">📋 Copy script</button>
        </div>
        <div class="card">
          <div class="card-title">Auto-Apply</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:12px">When enabled, bot attempts claims for shifts matching your city/pay filters.</p>
          <div class="checkbox-group"><input type="checkbox" id="p-autoapply"><label for="p-autoapply">Enable Auto-Apply</label></div>
          <div class="form-row">
            <div class="form-group"><label>Gender</label><input id="p-gender" type="text" placeholder="e.g. male/female/other" /></div>
            <div class="form-group"><label>Work Authorization</label><input id="p-work-auth" type="text" placeholder="e.g. citizen/work_permit" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>DOB</label><input id="p-dob" type="date" /></div>
            <div class="form-group"><label>Phone (for call alerts)</label><input id="p-phone" type="text" placeholder="+14165550000" /></div>
          </div>
          <div class="form-group"><label>SIN (encrypted)</label><input id="p-sin-encrypted" type="text" placeholder="Encrypted SIN blob/token" /></div>
          <div class="form-group">
            <label>Interview preference</label>
            <select id="p-interview-pref">
              <option value="earliest">Earliest available</option>
              <option value="preferred_window">Preferred time window</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Window start</label><input id="p-window-start" type="time" /></div>
            <div class="form-group"><label>Window end</label><input id="p-window-end" type="time" /></div>
          </div>
          <div class="form-group">
            <label>Assessment replay payload (JSON)</label>
            <textarea id="p-assessment-json" rows="3" placeholder='{"answers":[...]}' style="width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px; border-radius: 4px; font-family: monospace;"></textarea>
          </div>
          <div class="form-group">
            <label>Address history (JSON array, 5 years)</label>
            <textarea id="p-address-history-json" rows="3" placeholder='[{"line1":"...","city":"...","from":"2022-01","to":"2024-03"}]' style="width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px; border-radius: 4px; font-family: monospace;"></textarea>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Amazon Session Injection</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Bypass login captchas! Log into Amazon on your browser, run the extraction script, and paste the JSON output here.</p>
        <div class="form-group">
          <label>Session JSON Payload</label>
          <textarea id="p-session-json" rows="4" placeholder='{"tokens": {...}, "cookies": "..."}' style="width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px; border-radius: 4px; font-family: monospace;"></textarea>
        </div>
        <div class="divider"></div>
        <button class="btn btn-primary btn-full" onclick="saveProfile()">💾 Save Profile & Session</button>
      </div>
    </div>`;

    document.getElementById('p-visa').value = p.visaStatus || 'unknown';
    document.getElementById('p-sin').checked = !!p.documents?.sin;
    document.getElementById('p-wp').checked = !!p.documents?.workPermit;
    document.getElementById('p-city').value = p.filters?.city || '';
    document.getElementById('p-pay').value = p.filters?.minPay != null ? p.filters.minPay : '';
    document.getElementById('p-timing').value = p.filters?.preferredTiming || 'flexible';
    document.getElementById('p-telegram').value = p.botSettings?.notifyTelegramId || '';
    document.getElementById('p-session-snippet').value = sessionSnippet;
    document.getElementById('p-autoapply').checked = !!p.botSettings?.autoApply;
    document.getElementById('p-gender').value = p.autoApplyProfile?.gender || '';
    document.getElementById('p-work-auth').value = p.autoApplyProfile?.workAuthorization || '';
    document.getElementById('p-dob').value = p.autoApplyProfile?.dob || '';
    document.getElementById('p-phone').value = p.autoApplyProfile?.phoneNumber || '';
    document.getElementById('p-sin-encrypted').value = p.autoApplyProfile?.sinEncrypted || '';
    document.getElementById('p-interview-pref').value = p.autoApplyProfile?.interviewPreference || 'earliest';
    document.getElementById('p-window-start').value = p.autoApplyProfile?.interviewWindow?.start || '';
    document.getElementById('p-window-end').value = p.autoApplyProfile?.interviewWindow?.end || '';
    document.getElementById('p-assessment-json').value = JSON.stringify(p.autoApplyProfile?.assessmentReplay || {}, null, 2);
    document.getElementById('p-address-history-json').value = JSON.stringify(p.autoApplyProfile?.addressHistory || [], null, 2);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function copySessionSnippet() {
  const t = document.getElementById('p-session-snippet');
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t.value);
    toast('Copied script to clipboard');
  } catch {
    t.focus();
    t.select();
    document.execCommand('copy');
    toast('Copied script to clipboard');
  }
}

async function saveProfile() {
  let assessmentReplay = {};
  let addressHistory = [];
  try {
    const rawAssessment = document.getElementById('p-assessment-json').value.trim();
    assessmentReplay = rawAssessment ? JSON.parse(rawAssessment) : {};
  } catch {
    return toast('Assessment replay JSON is invalid', 'error');
  }
  try {
    const rawAddress = document.getElementById('p-address-history-json').value.trim();
    addressHistory = rawAddress ? JSON.parse(rawAddress) : [];
    if (!Array.isArray(addressHistory)) throw new Error('Address history must be an array');
  } catch {
    return toast('Address history JSON must be an array', 'error');
  }

  const body = {
    visaStatus:    document.getElementById('p-visa').value,
    documents:     { sin: document.getElementById('p-sin').checked, workPermit: document.getElementById('p-wp').checked },
    sessionJson:   document.getElementById('p-session-json').value.trim(),
    filters: {
      city:   document.getElementById('p-city').value.trim(),
      minPay: parseFloat(document.getElementById('p-pay').value) || undefined,
      preferredTiming: document.getElementById('p-timing').value
    },
    botSettings: {
      notifyTelegramId: document.getElementById('p-telegram').value.trim(),
      autoApply: document.getElementById('p-autoapply').checked,
    },
    autoApplyProfile: {
      gender: document.getElementById('p-gender').value.trim(),
      workAuthorization: document.getElementById('p-work-auth').value.trim(),
      dob: document.getElementById('p-dob').value || '',
      phoneNumber: document.getElementById('p-phone').value.trim(),
      sinEncrypted: document.getElementById('p-sin-encrypted').value.trim(),
      interviewPreference: document.getElementById('p-interview-pref').value,
      interviewWindow: {
        start: document.getElementById('p-window-start').value || '',
        end: document.getElementById('p-window-end').value || '',
      },
      assessmentReplay,
      addressHistory,
    },
  };
  try {
    await api('POST', '/api/user/update-profile', body);
    toast('Profile saved!');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Polling ──────────────────────────────────────────────────
function startPolling() {
  clearInterval(S.pollTimer);
  S.pollTimer = setInterval(async () => {
    if (!S.token) return clearInterval(S.pollTimer);
    try {
      const b = await api('GET', '/api/bot/status').catch(() => ({ running: false }));
      updateBotPill(b.running);
    } catch { /* silently ignore */ }
  }, 10_000);
}

function updateBotPill(running) {
  const pill = document.getElementById('bot-status-pill');
  if (!pill) return;
  pill.className = `badge-pill ${running ? 'badge-green' : 'badge-gray'}`;
  pill.textContent = running ? '● Bot Running' : '● Bot Idle';
}

// ── Boot ─────────────────────────────────────────────────────
window.handleAuth  = handleAuth;
window.renderAuth  = renderAuth;
window.nav         = nav;
window.logout      = logout;
window.botStart    = botStart;
window.botStop     = botStop;
window.saveProfile = saveProfile;
window.pageShifts  = pageShifts;
window.toggleShiftsShowAll = toggleShiftsShowAll;
window.copySessionSnippet = copySessionSnippet;

render();
