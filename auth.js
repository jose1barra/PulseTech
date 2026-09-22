const app = document.querySelector('#app');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite');
async function request(url, data) {
  const response = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to connect. Please try again.');
  return result;
}
async function boot() {
  app.innerHTML = '<main class="auth-loading" role="status">Opening your workspace…</main>';
  try {
    const session = await request('/api/session');
    if (inviteToken) {
      if (session.user) {
        app.innerHTML = '<main class="auth-loading"><h2>You are already signed in.</h2><p>Sign out before accepting a teammate invitation.</p><button class="button primary" id="invite-signout">Sign out & accept invitation</button><button class="button secondary" id="continue-workspace">Return to workspace</button><p id="invite-error" role="alert"></p></main>';
        document.querySelector('#continue-workspace').onclick = () => { location.hash = ''; location.reload(); };
        document.querySelector('#invite-signout').onclick = async () => {
          try { await request('/api/logout', {}); location.reload(); }
          catch { document.querySelector('#invite-error').textContent = 'Unable to sign out. Please try again.'; }
        };
        return;
      }
      let invitation;
      try { invitation = await request('/api/invitation', { token: inviteToken }); }
      catch (error) {
        app.innerHTML = `<main class="auth-loading"><h2>Invitation unavailable</h2><p>${escape(error.message)}</p><p>Ask your manager for a new invitation.</p><a class="button primary" href="/">Back to sign in</a></main>`;
        return;
      }
      showSignIn(false, invitation);
      return;
    }
    if (session.user) { await import('/app.js'); return; }
    showSignIn(session.setupRequired, null, session.setupTokenRequired);
  } catch {
    app.innerHTML = '<main class="auth-loading"><p>Unable to connect to your workspace.</p><button class="button primary" id="retry">Try again</button></main>';
    document.querySelector('#retry').onclick = () => location.reload();
  }
}
function showSignIn(setup, invitation = null, setupTokenRequired = false) {
  const creating = setup || Boolean(invitation);
  const submitLabel = invitation ? 'Join workspace' : setup ? 'Create account & sign in' : 'Sign in';
  app.innerHTML = `<main class="login"><section class="login-story"><a class="brand" href="/" aria-label="Pulse Tech home"><span><span class="brand-wordmark"><span class="brand-initial" aria-hidden="true"></span><span>ulse<span class="brand-light">tech</span></span></span><small>FIELD WORKSPACE</small></span></a><div><span class="eyebrow">GOOD SERVICE STARTS HERE</span><h1>Your team.<br>Your day.<br>All in one place.</h1><p>A little less admin.<br>A lot more getting things done.</p><div class="login-feature">Jobs, people, and progress — connected.</div></div><span class="login-foot">Built for the people who make technology work.</span></section><section class="login-form"><div class="login-form-inner"><span class="eyebrow">${invitation ? 'JOIN YOUR TEAM' : setup ? 'YOUR WORKSPACE STARTS HERE' : 'STAFF SIGN IN'}</span><h2>${invitation ? 'Accept your invitation.' : setup ? 'Create your owner account.' : 'Welcome back.'}</h2><p class="muted">${invitation ? `Welcome, ${escape(invitation.name)}. Create your password to join as a ${invitation.role === 'manager' ? 'manager' : 'technician'}.` : setup ? 'Set up your account to access and manage the workspace.' : 'Sign in to access your jobs, customers, and team.'}</p><form id="signin-form" class="signin-form">
  ${setup ? '<label for="signin-name">Full name</label><input id="signin-name" name="name" autocomplete="name" maxlength="80" required>' : ''}
  ${setup && setupTokenRequired ? '<label for="setup-token">Workspace setup code</label><input id="setup-token" name="setupToken" type="password" autocomplete="off" required>' : ''}
  <label for="signin-email">Email address</label><input id="signin-email" name="email" type="email" autocomplete="username" maxlength="254" placeholder="you@company.com" ${invitation ? `value="${escape(invitation.email)}" readonly` : ''} required>
  <label for="signin-password">Password</label><div class="password-field"><input id="signin-password" name="password" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" ${creating ? 'minlength="12"' : ''} maxlength="128" aria-describedby="password-hint" required><button type="button" id="show-password" aria-controls="signin-password" aria-pressed="false">Show</button></div><p class="field-hint" id="password-hint">${creating ? 'Use at least 12 characters.' : 'Use the password you created for this workspace.'}</p>
  ${creating ? '<label for="confirm-password">Confirm password</label><input id="confirm-password" name="confirm" type="password" autocomplete="new-password" maxlength="128" required>' : ''}
  <p id="signin-error" class="form-error" role="alert"></p><button class="button primary signin-submit" type="submit">${submitLabel} <span aria-hidden="true">→</span></button></form><div class="demo-note"><p>Private staff workspace. ${setup ? 'This account will be the workspace owner.' : 'Only authorized staff can sign in.'}</p></div></div></section></main>`;
  const password = document.querySelector('#signin-password');
  document.querySelector('#show-password').onclick = event => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.target.textContent = visible ? 'Hide' : 'Show';
    event.target.setAttribute('aria-pressed', String(visible));
  };
  document.querySelector('#signin-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, data = Object.fromEntries(new FormData(form));
    const error = document.querySelector('#signin-error');
    error.textContent = '';
    if (creating && data.password !== data.confirm) { error.textContent = 'Passwords do not match.'; document.querySelector('#confirm-password').focus(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      await request(invitation ? '/api/accept-invite' : setup ? '/api/setup' : '/api/login', { ...data, ...(invitation ? { token: inviteToken } : {}) });
      if (invitation) history.replaceState(null, '', '/');
      location.reload();
    } catch (failure) {
      error.textContent = failure.message === 'Failed to fetch' ? 'Unable to connect. Please try again.' : failure.message;
      button.disabled = false;
      button.textContent = submitLabel;
    }
  };
}
boot();
