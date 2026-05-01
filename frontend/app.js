// ── State ────────────────────────────────────────────────────
const S = {
  token: localStorage.getItem('token'),
  userEmail: localStorage.getItem('userEmail') || '',
  page: 'overview',
  pollTimer: null,
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
    amazon:   'Amazon Account',
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
        ${navItem('amazon','🔑','Amazon Account')}
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
    case 'amazon':   await pageAmazon(el);   break;
    case 'profile':  await pageProfile(el);  break;
  }
}

async function pageOverview(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading...</div>`;
  try {
    const [bot, tokenStatus] = await Promise.all([
      api('GET', '/api/bot/status').catch(() => ({ running: false })),
      api('GET', '/api/amazon-auth/status').catch(() => ({ hasAccessToken: false })),
    ]);
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card ${bot.running ? 'green' : 'blue'}">
          <div class="stat-label">Bot Status</div>
          <div class="stat-value">${bot.running ? '🟢' : '⚫'}</div>
          <div class="stat-sub">${bot.running ? `Running · every ${bot.intervalMinutes}m` : 'Stopped'}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Shifts Found</div>
          <div class="stat-value">${bot.lastShiftsFound ?? '—'}</div>
          <div class="stat-sub">Last scan</div>
        </div>
        <div class="stat-card ${tokenStatus.hasAccessToken && !tokenStatus.isExpired ? 'green' : 'orange'}">
          <div class="stat-label">Amazon Token</div>
          <div class="stat-value">${tokenStatus.hasAccessToken ? (tokenStatus.isExpired ? '⚠️' : '✅') : '❌'}</div>
          <div class="stat-sub">${tokenStatus.hasAccessToken ? (tokenStatus.isExpired ? 'Expired' : 'Active') : 'Not connected'}</div>
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
            ${!tokenStatus.hasAccessToken ? `
              <button class="btn btn-primary" onclick="nav('amazon')">🔑 Connect Amazon Account</button>` : `
              <button class="btn btn-primary" onclick="nav('bot')">${bot.running ? '⚡ Manage Bot' : '▶ Start Bot'}</button>`}
            <button class="btn btn-secondary" onclick="nav('shifts')">📋 View Shifts</button>
            <button class="btn btn-secondary" onclick="nav('profile')">👤 Edit Profile</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Bot Details</div>
          ${bot.running ? `
            <div class="token-row"><span class="token-key">Status</span><span class="badge-pill badge-green">● Running</span></div>
            <div class="token-row"><span class="token-key">Interval</span><span class="token-value">${bot.intervalMinutes} min</span></div>
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
              ? `Scanning every ${status.intervalMinutes} min · Last scan: ${status.lastRun ? new Date(status.lastRun).toLocaleTimeString() : 'pending'}`
              : status.lastError ? `Last error: ${status.lastError}` : 'Click Start to begin scanning'
            }</div>
          </div>
        </div>
        <div class="bot-controls">
          <div class="interval-selector">
            <label>Every</label>
            <select id="bot-interval">
              <option value="1">1 min</option>
              <option value="5" ${!status.intervalMinutes || status.intervalMinutes===5?'selected':''}>5 min</option>
              <option value="10" ${status.intervalMinutes===10?'selected':''}>10 min</option>
              <option value="15" ${status.intervalMinutes===15?'selected':''}>15 min</option>
              <option value="30" ${status.intervalMinutes===30?'selected':''}>30 min</option>
            </select>
          </div>
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
            ${status.lastError ? `<div class="token-row"><span class="token-key">Error</span><span class="token-value" style="color:var(--danger);font-size:11px">${status.lastError}</span></div>` : ''}
          ` : `<div class="empty-state" style="padding:20px"><p>No scans run yet.</p></div>`}
        </div>
        <div class="card">
          <div class="card-title">How It Works</div>
          <div class="stack" style="gap:12px">
            ${['🔑 Uses your stored Amazon token — no re-login', '📧 If token expires, refreshes silently', '📦 Saves found shifts to database', '🔔 (Notifications coming soon)'].map(s=>
              `<div style="font-size:13px;color:var(--text2)">${s}</div>`).join('')}
          </div>
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function botStart() {
  const interval = parseInt(document.getElementById('bot-interval')?.value) || 5;
  try {
    await api('POST', '/api/bot/start', { intervalMinutes: interval });
    toast(`Bot started — scanning every ${interval} min`);
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
    const shifts = await api('POST', '/api/shifts/get-shifts');
    el.innerHTML = `
      <div class="section-header">
        <h3>Available Shifts <span style="color:var(--text3);font-size:13px;font-weight:400">${shifts.length} found</span></h3>
        <div class="section-actions">
          <button class="btn btn-secondary btn-sm" onclick="pageShifts(document.getElementById('content'))">🔄 Refresh</button>
        </div>
      </div>`;
    if (!shifts.length) {
      el.innerHTML += `<div class="empty-state"><div class="empty-icon">📋</div><h4>No shifts yet</h4><p>Start the bot to scan for available shifts.</p></div>`;
    } else {
      el.innerHTML += `<div class="shifts-grid">${shifts.map(shiftCard).join('')}</div>`;
    }
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h4>Error</h4><p>${e.message}</p></div>`;
  }
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

async function pageAmazon(el) {
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading...</div>`;
  try {
    const ts = await api('GET', '/api/amazon-auth/status').catch(() => ({}));
    el.innerHTML = `
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="card-title">Token Status</div>
            <div class="token-row"><span class="token-key">Access Token</span>
              <span class="badge-pill ${ts.hasAccessToken ? 'badge-green' : 'badge-red'}">${ts.hasAccessToken ? '✅ Present' : '❌ Missing'}</span></div>
            <div class="token-row"><span class="token-key">Refresh Token</span>
              <span class="badge-pill ${ts.hasRefreshToken ? 'badge-green' : 'badge-red'}">${ts.hasRefreshToken ? '✅ Present' : '❌ Missing'}</span></div>
            <div class="token-row"><span class="token-key">Expires At</span>
              <span class="token-value">${ts.tokenExpiresAt ? new Date(ts.tokenExpiresAt).toLocaleString() : '—'}</span></div>
            <div class="token-row"><span class="token-key">Last Login</span>
              <span class="token-value">${ts.lastLogin ? new Date(ts.lastLogin).toLocaleString() : 'Never'}</span></div>
            <div class="divider"></div>
            <div class="stack">
              <button class="btn btn-primary btn-full" onclick="amazonLogin()">🔑 ${ts.hasAccessToken ? 'Re-connect' : 'Connect'} Amazon</button>
              ${ts.hasAccessToken ? `<button class="btn btn-secondary btn-full btn-sm" onclick="amazonRefresh()">🔄 Force Refresh Token</button>` : ''}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Kiosk PIN</div>
            <p style="font-size:12px;color:var(--text2);margin-bottom:14px">Store your kiosk PIN for reference (not used for login).</p>
            <div class="form-group"><label>PIN</label><input id="kiosk-pin" type="text" placeholder="e.g. 1234" /></div>
            <button class="btn btn-secondary btn-full btn-sm" onclick="savePin()">💾 Save PIN</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">OTP Email Config</div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:16px">When Amazon sends an OTP, the bot reads it from your inbox automatically via IMAP.</p>
          <div class="form-group"><label>Email Address</label><input id="otp-email" type="email" placeholder="your@gmail.com" /></div>
          <div class="form-group"><label>App Password</label><input id="otp-pass" type="password" placeholder="Gmail app password" /></div>
          <div class="form-group"><label>IMAP Host</label><input id="otp-host" type="text" placeholder="imap.gmail.com" value="imap.gmail.com" /></div>
          <button class="btn btn-primary btn-full" onclick="saveOtpConfig()">💾 Save OTP Config</button>
          <p style="font-size:11px;color:var(--text3);margin-top:12px">💡 For Gmail: enable 2FA and create an App Password at myaccount.google.com/apppasswords</p>
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function amazonLogin() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = '⏳ Launching browser…';
  try {
    await api('POST', '/api/amazon-auth/login');
    toast('Amazon login successful! Tokens stored.');
    pageAmazon(document.getElementById('content'));
  } catch(e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = '🔑 Connect Amazon';
  }
}

async function amazonRefresh() {
  try {
    await api('POST', '/api/amazon-auth/refresh');
    toast('Token refreshed silently!');
    pageAmazon(document.getElementById('content'));
  } catch(e) { toast(e.message, 'error'); }
}

async function savePin() {
  const pin = document.getElementById('kiosk-pin').value.trim();
  if (!pin) return toast('Enter a PIN', 'error');
  try {
    await api('POST', '/api/amazon-auth/set-pin', { pin });
    toast('Kiosk PIN saved!');
  } catch(e) { toast(e.message, 'error'); }
}

async function saveOtpConfig() {
  const body = {
    otpEmail:         document.getElementById('otp-email').value.trim(),
    otpEmailPassword: document.getElementById('otp-pass').value.trim(),
    otpEmailHost:     document.getElementById('otp-host').value.trim() || 'imap.gmail.com',
  };
  if (!body.otpEmail || !body.otpEmailPassword) return toast('Fill in email and password', 'error');
  try {
    await api('POST', '/api/amazon-auth/set-otp-email', body);
    toast('OTP email config saved!');
  } catch(e) { toast(e.message, 'error'); }
}

async function pageProfile(el) {
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
          <div class="form-row">
            <div class="form-group"><label>City</label><input id="p-city" type="text" placeholder="e.g. Toronto" /></div>
            <div class="form-group"><label>Min Pay ($/hr)</label><input id="p-pay" type="number" placeholder="e.g. 18" /></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Amazon Credentials</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Stored securely — used by the bot to log in to hiring.amazon.ca.</p>
        <div class="form-group"><label>Amazon Email</label><input id="p-aemail" type="email" placeholder="your@amazon.ca account" /></div>
        <div class="form-group"><label>Amazon Password</label><input id="p-apass" type="password" placeholder="Amazon password" /></div>
        <div class="divider"></div>
        <button class="btn btn-primary btn-full" onclick="saveProfile()">💾 Save Profile</button>
      </div>
    </div>`;
}

async function saveProfile() {
  const body = {
    visaStatus:    document.getElementById('p-visa').value,
    documents:     { sin: document.getElementById('p-sin').checked, workPermit: document.getElementById('p-wp').checked },
    amazonEmail:   document.getElementById('p-aemail').value.trim(),
    amazonPassword: document.getElementById('p-apass').value.trim(),
    filters: {
      city:   document.getElementById('p-city').value.trim(),
      minPay: parseFloat(document.getElementById('p-pay').value) || undefined,
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
window.amazonLogin = amazonLogin;
window.amazonRefresh = amazonRefresh;
window.savePin     = savePin;
window.saveOtpConfig = saveOtpConfig;
window.saveProfile = saveProfile;
window.pageShifts  = pageShifts;
window.pageAmazon  = pageAmazon;

render();
