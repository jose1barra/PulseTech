const app = document.querySelector('#app');
async function boot() {
  app.innerHTML = '<main class="auth-loading" role="status">Opening your workspace…</main>';
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const session = await response.json();
    if (session.user) { await import('/app.js'); return; }
    showSignIn(session.setupRequired);
  } catch {
    app.innerHTML = '<main class="auth-loading"><p>Unable to connect to your workspace.</p><button class="button primary" id="retry">Try again</button></main>';
    document.querySelector('#retry').onclick = () => location.reload();
  }
}
function showSignIn(setup) {
  app.innerHTML = `<main class="login"><section class="login-story"><a class="brand" href="/"><span>Pulse Tech<small>FIELD WORKSPACE</small></span></a><div><span class="eyebrow">GOOD SERVICE STARTS HERE</span><h1>Your team.<br>Your day.<br>All in one place.</h1><p>A little less admin.<br>A lot more getting things done.</p><div class="login-feature">Jobs, people, and progress — connected.</div></div><span class="login-foot">Built for the people who make technology work.</span></section><section class="login-form"><div class="login-form-inner"><span class="eyebrow">${setup ? 'YOUR WORKSPACE STARTS HERE' : 'STAFF SIGN IN'}</span><h2>${setup ? 'Create your owner account.' : 'Welcome back.'}</h2><p class="muted">${setup ? 'Set up your account to access and manage the workspace.' : 'Sign in to access your jobs, customers, and team.'}</p><form id="signin-form" class="signin-form">${setup ? '<label for="signin-name">Full name</label><input id="signin-name" name="name" autocomplete="name" maxlength="80" required>' : ''}<label for="signin-email">Email address</label><input id="signin-email" name="email" type="email" autocomplete="username" maxlength="254" placeholder="you@company.com" required><label for="signin-password">Password</label><div class="password-field"><input id="signin-password" name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" ${setup ? 'minlength="12"' : ''} maxlength="128" aria-describedby="password-hint" required><button type="button" id="show-password" aria-controls="signin-password" aria-pressed="false">Show</button></div><p class="field-hint" id="password-hint">${setup ? 'Use at least 12 characters.' : 'Use the password you created for this workspace.'}</p>${setup ? '<label for="confirm-password">Confirm password</label><input id="confirm-password" name="confirm" type="password" autocomplete="new-password" maxlength="128" required>' : ''}<p id="signin-error" class="form-error" role="alert"></p><button class="button primary signin-submit" type="submit">${setup ? 'Create account & sign in' : 'Sign in'} <span aria-hidden="true">→</span></button></form><div class="demo-note"><p>Private staff workspace. ${setup ? 'This account will be the workspace owner.' : 'Only authorized staff can sign in.'}</p></div></div></section></main>`;
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
    if (setup && data.password !== data.confirm) { error.textContent = 'Passwords do not match.'; document.querySelector('#confirm-password').focus(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const response = await fetch(setup ? '/api/setup' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      location.reload();
    } catch (failure) {
      error.textContent = failure.message === 'Failed to fetch' ? 'Unable to connect. Please try again.' : failure.message;
      button.disabled = false;
      button.textContent = setup ? 'Create account & sign in' : 'Sign in';
    }
  };
}
boot();
