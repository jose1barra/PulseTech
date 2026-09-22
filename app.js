import { STATUSES, canAccess, visibleJobs, isOverdue, allowedStatuses, nextStatus } from './view-model.js';

const icons = {
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  jobs: '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M9 6V3h6v3M8 11h8M8 16h5"/>', people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron: '<path d="m9 5 7 7-7 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="m5 12 4 4L19 6"/>', alert: '<path d="m12 3 10 18H2L12 3Z M12 9v5M12 17v.1"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>', tool: '<path d="M14 6a5 5 0 0 0-6 6l-5 5a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>', home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>', laptop: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="m4 16-2 5h20l-2-5M9 18h6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', logout: '<path d="M9 3H4v18h5M10 12h11m-4-4 4 4-4 4"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 5 9 8 9-8"/>', phone: '<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 2-4 3-9 0S3 10 3 6c0-2 1-3 2-3Z"/>', filter: '<path d="M4 7h16M7 12h10M10 17h4"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.jobs}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let storageWarning = '';
let mutationVersion = 0;
let busy = false, state, user, STAFF = [], CUSTOMERS = [];
let teamState = { users: [], invitations: [] }, inviteLink = '';
const userById = id => STAFF.find(person => person.id === id);
const customerById = id => CUSTOMERS.find(customer => customer.id === id);
async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (response.status === 401) { document.querySelector('#app').replaceChildren(); document.querySelector('#detail').close(); location.reload(); throw new Error('Please sign in again.'); }
  if (!response.ok) { const error = new Error(result.error || 'Unable to save. Please try again.'); error.status = response.status; throw error; }
  return result;
}
function applySnapshot(next) { state = next; user = next.user; STAFF = next.staff; CUSTOMERS = next.customers; }
applySnapshot(await api('/api/workspace'));
if (user.role === 'manager') teamState = await api('/api/team');
let page = 'overview', statusFilter = 'all', staffFilter = 'all', dateFilter = 'all', search = '', selectedJob = null, detailTab = 'overview';
let customerSelection = null;
const app = document.querySelector('#app');
const dialog = document.querySelector('#detail');
const time = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const date = value => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
const stamp = value => `${date(value)} at ${time(value)}`;
const today = value => new Date(value).toDateString() === new Date().toDateString();
const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');
const statusClass = status => status.toLowerCase().replaceAll(' ', '-');
const badge = status => `<span class="badge ${statusClass(status)}"><span></span>${escape(status)}</span>`;
const avatar = (person, small = false) => `<span class="avatar ${person?.color || 'neutral'} ${small ? 'small' : ''}">${escape(person?.initials || '—')}</span>`;
const serviceIcon = service => service === 'Installation' ? 'home' : service === 'Repair' ? 'tool' : 'laptop';
const myAlerts = () => state.alerts.filter(alert => alert.userId === user?.id);
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4500); }
async function mutate(path, method, data) {
  if (busy) throw new Error('Please wait for the current update.');
  busy = true;
  mutationVersion++;
  document.querySelectorAll('button').forEach(button => button.disabled = true);
  try { return await api(path, { method, body: JSON.stringify(data) }); }
  finally { busy = false; document.querySelectorAll('button').forEach(button => button.disabled = false); }
}
async function refreshWorkspace(background = false) {
  const generation = mutationVersion;
  const next = await api('/api/workspace');
  const nextTeam = next.user.role === 'manager' ? await api('/api/team') : { users: [], invitations: [] };
  if (background && (generation !== mutationVersion || busy || dialog.open || document.activeElement?.matches('input, textarea, select'))) return false;
  applySnapshot(next); teamState = nextTeam;
  return true;
}
function loginScreen() { location.reload(); }

function render() {
  if (!user) { loginScreen(); return; }
  const unread = myAlerts().filter(item => !item.read).length;
  const nav = (id, label, image) => `<button class="nav-item ${page === id ? 'active' : ''}" data-action="nav" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>${icon(image)}<span>${label}</span>${id === 'notifications' && unread ? `<b class="nav-count">${unread}</b>` : ''}</button>`;
  app.innerHTML = `<div class="workspace"><aside class="sidebar"><a class="brand" href="/" aria-label="Pulse Tech home"><span><span class="brand-wordmark"><span class="brand-initial" aria-hidden="true"></span><span>ulse<span class="brand-light">tech</span></span></span><small>FIELD WORKSPACE</small></span></a><div class="workspace-label">WORKSPACE</div><nav aria-label="Main navigation">${nav('overview', 'Overview', 'grid')}${nav('jobs', user.role === 'manager' ? 'All jobs' : 'My jobs', 'jobs')}${nav('customers', 'Customers', 'people')}${nav('notifications', 'Notifications', 'bell')}${user.role === 'manager' ? nav('team', 'Team', 'people') : ''}</nav><div class="sidebar-bottom"><div class="workspace-tip"><span class="tip-icon">${icon('pulse')}</span><strong>Small details.<br>Better service.</strong><p>Keep your jobs up to date.<br>Your team will thank you.</p></div><div class="demo-label"><span></span> Shared workspace</div><button class="account" data-action="logout" title="Sign out">${avatar(user)}<span><strong>${escape(user.name)}</strong><small>${escape(user.title)}</small></span>${icon('logout')}</button></div></aside><div class="main-wrap"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <strong>${({ overview: 'Overview', jobs: 'Jobs', customers: 'Customers', notifications: 'Notifications', team: 'Team' })[page]}</strong></div><div class="topbar-right"><span class="today-label">${icon('calendar')}${new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span><button class="icon-button notification-button" data-action="nav" data-page="notifications" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">${icon('bell')}${unread ? '<i></i>' : ''}</button><button class="avatar-button" data-action="logout" aria-label="Sign out">${avatar(user, true)}</button></div></header><main id="main-content" class="content">${storageWarning ? `<div class="storage-warning">${escape(storageWarning)}</div>` : ''}${page === 'overview' || page === 'jobs' ? jobsPage() : page === 'customers' ? customersPage() : page === 'team' ? teamPage() : notificationsPage()}</main><footer class="page-footer"><span>Pulse Tech <span class="footer-dot">·</span> A better day in the field.</span><span>${icon('shield')} Internal workspace</span></footer></div></div>`;
}
function teamPage() {
  const unclaimed = teamState.users.filter(member => !member.registered && !member.owner);
  return `<section class="page-heading"><div><span class="eyebrow">YOUR PEOPLE, CONNECTED</span><h1>Team<span class="greeting-dot">.</span></h1><p>Invite staff and manage access to your workspace.</p></div><span class="heading-tag">${icon('shield')} ${teamState.users.filter(member => member.registered && !member.disabled).length} active accounts</span></section>
  <div class="team-layout"><section class="jobs-panel team-invite"><div class="panel-heading"><div><h2>Invite a teammate</h2><p>Send a private link so they can create their own password.</p></div></div>
  <form id="invite-form" class="signin-form team-form"><label for="invite-profile">Staff profile</label><select id="invite-profile" name="staffId"><option value="">New team member</option>${unclaimed.filter(member => member.role === 'tech' || user.owner).map(member => `<option value="${member.id}">${escape(member.name)} &middot; existing assignments</option>`).join('')}</select><label for="invite-name">Full name</label><input id="invite-name" name="name" autocomplete="off" maxlength="80" required><label for="invite-email">Work email</label><input id="invite-email" name="email" type="email" autocomplete="off" maxlength="254" required><label for="invite-role">Role</label><select id="invite-role" name="role"><option value="tech">Technician &middot; assigned jobs</option>${user.owner ? '<option value="manager">Manager &middot; all jobs and staff invitations</option>' : ''}</select><p class="field-hint">Links expire after 48 hours and work once. Creating a replacement cancels the previous link.</p><p class="form-error" role="alert"></p><button class="button primary signin-submit" type="submit">Create invitation ${icon('arrow')}</button></form>
  ${inviteLink ? `<div class="invite-result" role="status"><label for="invite-link">Invitation ready &mdash; copy and share privately</label><input id="invite-link" value="${escape(inviteLink)}" readonly><button class="button secondary" data-action="copy-invite">Copy link</button><p class="field-hint">This link is shown only now. Email delivery is not configured.</p></div>` : ''}</section>
  <section class="jobs-panel"><div class="panel-heading"><div><h2>Team members</h2><p>Unclaimed profiles keep their existing job assignments.</p></div></div><div class="team-members">${teamState.users.map(member => `<article class="team-member">${avatar(member)}<div><strong>${escape(member.name)}</strong><p>${escape(member.email || 'No login yet')}</p><small>${member.owner ? 'Owner' : member.role === 'manager' ? 'Manager' : 'Technician'} &middot; ${member.disabled ? 'Disabled' : member.registered ? 'Active' : 'Unclaimed profile'}</small></div>${!member.owner && member.id !== user.id && member.registered && (member.role === 'tech' || user.owner) ? `<button class="button secondary" data-action="toggle-member" data-id="${member.id}">${member.disabled ? 'Enable' : 'Disable'}</button>` : ''}</article>`).join('')}</div></section></div>
  <section class="jobs-panel invitations-panel"><div class="panel-heading"><div><h2>Pending invitations <span class="count-pill">${teamState.invitations.length}</span></h2><p>Revoke any link that should no longer grant access.</p></div></div>${teamState.invitations.length ? teamState.invitations.map(invitation => `<article class="team-member"><div><strong>${escape(invitation.name)}</strong><p>${escape(invitation.email)}</p><small>${invitation.role === 'manager' ? 'Manager' : 'Technician'} &middot; Expires ${stamp(invitation.expires)}</small></div>${invitation.role === 'tech' || user.owner ? `<button class="button secondary" data-action="revoke-invite" data-id="${invitation.id}">Revoke</button>` : ''}</article>`).join('') : '<p class="team-empty muted">No pending invitations.</p>'}</section>`;
}
function jobsPage() {
  const jobs = visibleJobs(state, user);
  const todaysJobs = jobs.filter(job => today(job.scheduled));
  const overdue = jobs.filter(job => isOverdue(job));
  const unassigned = jobs.filter(job => !job.assignee);
  return `<section class="page-heading"><div><span class="eyebrow">${page === 'overview' ? 'YOUR WORKDAY, AT A GLANCE' : 'EVERY DETAIL, IN ONE PLACE'}</span><h1>${page === 'overview' ? `Hello, ${escape(user.name.split(' ')[0])} <span class="greeting-dot">.</span>` : user.role === 'manager' ? 'All jobs' : 'My jobs'}</h1><p>${page === 'overview' ? (user.role === 'manager' ? 'Here’s what’s happening across your team today.' : 'Your next great service starts here. Let’s get to work.') : 'Stay on top of appointments, updates, and everything in between.'}</p></div><div class="heading-tag">${icon(user.role === 'manager' ? 'people' : 'tool')}${user.role === 'manager' ? 'Team workspace' : 'Technician workspace'}</div></section>${page === 'overview' ? `<section class="stats" aria-label="Job statistics">${stat('Today’s jobs', todaysJobs.length, 'Scheduled for today', 'calendar', 'blue', 'today')}${stat('In progress', jobs.filter(job => job.status === 'In Progress').length, 'Currently being worked on', 'pulse', 'orange', 'progress')}${stat('Completed today', todaysJobs.filter(job => job.status === 'Done').length, 'Today’s appointments marked done', 'check', 'green', 'done')}${stat('Needs attention', overdue.length, 'Past scheduled time · not done', 'alert', 'red', 'overdue')}</section>` : ''}${user.role === 'manager' && unassigned.length ? `<button class="attention-banner" data-action="filter-unassigned"><span class="attention-icon">${icon('people')}</span><span><strong>${unassigned.length} ${unassigned.length === 1 ? 'job needs' : 'jobs need'} a technician</strong><small>Assign someone to keep the day moving.</small></span><span class="banner-link">Review jobs ${icon('arrow')}</span></button>` : ''}<section class="jobs-panel"><div class="panel-heading"><div><h2>${page === 'overview' ? (user.role === 'manager' ? 'Team schedule' : 'Your schedule') : 'Job directory'} <span class="count-pill">${jobs.length}</span></h2><p>${user.role === 'manager' ? 'A clear view of every job and the people behind it.' : 'Everything you need for a well-prepared visit.'}</p></div><span class="sort-label">${icon('calendar')} Earliest first</span></div><div class="filters"><label class="search-box">${icon('search')}<input id="job-search" type="search" placeholder="Search jobs, customers, devices…" aria-label="Search jobs" value="${escape(search)}"></label><div class="filter-selects"><label class="sr-only" for="date-filter">Appointment date</label><select id="date-filter"><option value="all" ${dateFilter === 'all' ? 'selected' : ''}>All dates</option><option value="today" ${dateFilter === 'today' ? 'selected' : ''}>Today</option><option value="upcoming" ${dateFilter === 'upcoming' ? 'selected' : ''}>Upcoming</option><option value="overdue" ${dateFilter === 'overdue' ? 'selected' : ''}>Overdue</option></select><label class="sr-only" for="status-filter">Job status</label><select id="status-filter"><option value="all">All statuses</option>${STATUSES.map(status => `<option ${statusFilter === status ? 'selected' : ''}>${status}</option>`).join('')}</select>${user.role === 'manager' ? `<label class="sr-only" for="staff-filter">Assigned technician</label><select id="staff-filter"><option value="all">All technicians</option><option value="unassigned" ${staffFilter === 'unassigned' ? 'selected' : ''}>Unassigned</option>${STAFF.filter(person => person.role === 'tech' && !person.disabled).map(person => `<option value="${person.id}" ${staffFilter === person.id ? 'selected' : ''}>${escape(person.name)}</option>`).join('')}</select>` : ''}</div></div><div id="job-results">${jobResults()}</div></section><div class="bottom-note">${icon('info')} Appointments are shown in your local time. Select a job to see details and make updates.</div>`;
}
function stat(label, value, caption, image, color, filter) { return `<button class="stat-card" data-action="stat-filter" data-filter="${filter}"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon(image)}</span></div><strong>${value.toString().padStart(2, '0')}</strong><small>${caption}</small></button>`; }
function filteredJobs() {
  return visibleJobs(state, user).filter(job => (statusFilter === 'all' || job.status === statusFilter) && (staffFilter === 'all' || (staffFilter === 'unassigned' ? !job.assignee : job.assignee === staffFilter)) && (dateFilter === 'all' || (dateFilter === 'today' ? today(job.scheduled) : dateFilter === 'upcoming' ? new Date(job.scheduled) >= new Date() : isOverdue(job))) && `${job.id} ${job.title} ${job.device} ${customerById(job.customerId).name} ${job.service}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
}
function jobResults() {
  const jobs = filteredJobs();
  if (!jobs.length) return `<div class="empty-state">${icon('search')}<h3>No jobs found</h3><p>Try a different search or clear your filters.</p><button class="button secondary" data-action="clear-filters">Clear filters</button></div>`;
  return `<div class="table-scroll"><table class="jobs-table"><thead><tr><th>Job / Customer</th><th>Schedule</th>${user.role === 'manager' ? '<th>Technician</th>' : ''}<th>Status</th><th><span class="sr-only">Open job</span></th></tr></thead><tbody>${jobs.map(job => { const customer = customerById(job.customerId), assignee = userById(job.assignee); return `<tr><td><div class="job-cell"><span class="service-icon ${job.service === 'Repair' ? 'purple' : job.service === 'Installation' ? 'orange' : 'blue'}">${icon(serviceIcon(job.service))}</span><div><button class="job-title" data-action="open-job" data-id="${job.id}">${escape(job.title)}</button><div class="job-subtitle">${escape(customer.name)}<span>·</span>#${job.id}</div><div class="job-location">${icon(job.location === 'On-site' ? 'pin' : 'laptop')}${escape(job.location === 'On-site' ? customer.address.split(',')[0] : job.location)}</div></div></div></td><td><div class="schedule-time">${time(job.scheduled)}</div><div class="schedule-date">${today(job.scheduled) ? 'Today' : date(job.scheduled)}<span>·</span>1 hr</div></td>${user.role === 'manager' ? `<td><div class="assignee-cell">${avatar(assignee, true)}<span class="${assignee ? '' : 'unassigned'}">${escape(assignee ? assignee.name : 'Unassigned')}</span></div></td>` : ''}<td><div class="status-cell">${badge(job.status)}${isOverdue(job) ? `<span class="overdue">${icon('clock')} Overdue</span>` : ''}</div></td><td><button class="row-open icon-button" data-action="open-job" data-id="${job.id}" aria-label="Open job ${job.id}">${icon('chevron')}</button></td></tr>`; }).join('')}</tbody></table></div><div class="table-footer"><span>Showing ${jobs.length} of ${visibleJobs(state, user).length} jobs</span>${search || dateFilter !== 'all' || statusFilter !== 'all' || staffFilter !== 'all' ? '<button class="text-button" data-action="clear-filters">Clear filters</button>' : '<span>All caught up on the big picture.</span>'}</div>`;
}
function customersPage() {
  const jobs = visibleJobs(state, user);
  const ids = [...new Set(jobs.map(job => job.customerId))];
  return `<section class="page-heading"><div><span class="eyebrow">SERVICE WITH CONTEXT</span><h1>Customers<span class="greeting-dot">.</span></h1><p>${user.role === 'manager' ? 'The people you support, and the technology they rely on.' : 'Customer history for your assigned jobs.'}</p></div><span class="heading-tag">${icon('people')}${ids.length} customers</span></section><div class="customer-grid">${ids.map(id => { const customer = customerById(id); return `<button class="customer-card" data-action="open-customer" data-id="${id}"><span class="avatar neutral">${escape(initials(customer.name))}</span><h2>${escape(customer.name)}</h2><p>${escape(customer.email)}</p><div><span>${customer.devices.length} devices</span><span>${jobs.filter(job => job.customerId === id).length} jobs</span>${icon('arrow')}</div></button>`; }).join('') || '<div class="empty-state"><h3>No customers yet</h3><p>Customers will appear when you’re assigned a job.</p></div>'}</div>`;
}
function historyContent(customer) {
  const jobs = visibleJobs(state, user).filter(job => job.customerId === customer.id);
  return `<section class="detail-section"><h3>Devices & purchases</h3><div class="device-list">${customer.devices.map(device => `<div>${icon('laptop')}<span>${escape(device)}</span></div>`).join('')}</div><ul class="history-list">${customer.orders.map(order => `<li>${escape(order)}</li>`).join('')}</ul></section><section class="detail-section"><h3>Previous service</h3>${customer.history.length ? `<ul class="history-list">${customer.history.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">No previous service records.</p>'}</section><section class="detail-section"><h3>${user.role === 'manager' ? 'Jobs with this customer' : 'Your jobs with this customer'}</h3>${jobs.map(job => `<button class="history-job" data-action="open-job" data-id="${job.id}"><span><strong>${escape(job.title)}</strong><small>#${job.id} · ${stamp(job.scheduled)}</small></span>${badge(job.status)}${icon('chevron')}</button>`).join('')}</section>`;
}
function notificationsPage() {
  const alerts = myAlerts().sort((a, b) => new Date(b.at) - new Date(a.at));
  return `<section class="page-heading"><div><span class="eyebrow">STAY IN THE LOOP</span><h1>Notifications<span class="greeting-dot">.</span></h1><p>Assignment changes and appointment updates, all right here.</p></div>${alerts.some(item => !item.read) ? '<button class="button secondary" data-action="read-all">Mark all as read</button>' : ''}</section><section class="alerts-panel">${alerts.length ? alerts.map(alert => `<button class="alert-row ${alert.read ? '' : 'unread'}" data-action="open-alert" data-id="${escape(alert.id)}"><span class="service-icon blue">${icon('bell')}</span><span><strong>${escape(alert.text)}</strong><small>Job #${alert.jobId} · ${stamp(alert.at)}</small></span>${!alert.read ? '<span class="unread-dot" aria-label="Unread"></span>' : ''}${icon('chevron')}</button>`).join('') : `<div class="empty-state">${icon('bell')}<h3>You’re all caught up</h3><p>New assignments and schedule changes will appear here.</p></div>`}</section>`;
}
function openJob(id, preserveTab = false) {
  const job = state.jobs.find(item => item.id === id);
  if (!canAccess(user, job)) { toast('This job is no longer assigned to you.'); return; }
  selectedJob = id; customerSelection = null;
  if (!preserveTab) detailTab = 'overview';
  renderDetail();
  if (!dialog.open) dialog.showModal();
}
function renderDetail() {
  const job = state.jobs.find(item => item.id === selectedJob);
  if (!canAccess(user, job)) { dialog.close(); return; }
  const customer = customerById(job.customerId), assignee = userById(job.assignee), next = nextStatus(job);
  dialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">JOB #${job.id} <span>·</span> ${job.service.toUpperCase()}</span><button class="icon-button" data-action="close-dialog" aria-label="Close job details">${icon('close')}</button></div><div class="dialog-heading"><h2 id="detail-title">${escape(job.title)}</h2><p>${escape(customer.name)} <span>·</span> ${job.location}</p><div class="detail-badges">${badge(job.status)}${isOverdue(job) ? '<span class="overdue">Past scheduled time</span>' : ''}</div></div><div class="detail-tabs" role="tablist" aria-label="Job details">${[['overview', 'Overview'], ['history', 'Customer history'], ['activity', 'Activity']].map(([id, label]) => `<button role="tab" aria-selected="${detailTab === id}" aria-controls="detail-panel" data-action="detail-tab" data-tab="${id}" class="${detailTab === id ? 'active' : ''}">${label}</button>`).join('')}</div><div class="dialog-body" id="detail-panel" role="tabpanel" aria-label="${detailTab}">${detailTab === 'history' ? historyContent(customer) : detailTab === 'activity' ? `<div class="timeline">${[...job.activity].reverse().map(item => `<div class="timeline-item"><span class="timeline-dot"></span><strong>${escape(item.text)}</strong><p>${escape(item.author ? userById(item.author)?.name || 'Staff' : 'Customer booking')} · ${stamp(item.at)}</p></div>`).join('')}</div>` : `<div class="detail-summary"><div>${icon('calendar')}<span><small>Appointment</small><strong>${date(job.scheduled)} · ${time(job.scheduled)}</strong><small>60-minute appointment</small></span></div><div>${icon('people')}<span><small>Assigned to</small><strong>${escape(assignee?.name || 'Unassigned')}</strong><small>${escape(assignee?.title || 'Manager assignment needed')}</small></span></div></div><section class="detail-section status-section"><div class="section-title"><h3>Job status</h3><span class="subtle-label">Keep the team up to date</span></div><div class="status-controls"><label class="sr-only" for="job-status">Update job status</label><select id="job-status">${allowedStatuses(job).map(status => `<option ${job.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select>${next ? `<button class="button primary" data-action="next-status" data-status="${next}">${next === 'Done' ? icon('check') : icon('arrow')} ${next === 'Done' ? 'Mark done' : `Mark ${next.toLowerCase()}`}</button>` : ''}</div><p class="field-hint">Selecting a status saves it immediately.${job.location !== 'On-site' ? ' En Route applies only to on-site jobs.' : ''}</p></section><section class="detail-section"><h3>Service details</h3><div class="device-tag">${icon(serviceIcon(job.service))}${escape(job.device)}</div><p class="description">${escape(job.description)}</p></section><section class="detail-section"><h3>Customer contact</h3><div class="contact-list"><div>${icon('pin')}<span>${job.location === 'On-site' ? escape(customer.address) : job.location === 'Remote' ? 'Remote appointment · contact customer by phone' : 'Pulse Tech · in-store service desk'}</span></div><a href="tel:${customer.phone.replace(/[^\d+]/g, '')}">${icon('phone')}${customer.phone}</a><a href="mailto:${customer.email}">${icon('mail')}${customer.email}</a></div></section>${user.role === 'manager' ? `<section class="detail-section"><h3>Assignment & scheduling</h3><form id="schedule-form"><label for="assign-tech">Technician</label><select id="assign-tech" name="assignee"><option value="">Unassigned</option>${STAFF.filter(person => person.role === 'tech' && !person.disabled).map(person => `<option value="${person.id}" ${job.assignee === person.id ? 'selected' : ''}>${escape(person.name)} · ${escape(person.title)}</option>`).join('')}</select><label for="appointment">Appointment time</label><input id="appointment" name="scheduled" type="datetime-local" required value="${localDateTime(job.scheduled)}"><p class="field-hint">Changing the time marks the job Rescheduled. Each visit reserves one hour.</p><p class="form-error" id="schedule-error" role="alert"></p><button class="button secondary" type="submit">Save assignment & time</button></form></section>` : ''}<section class="detail-section"><div class="section-title"><h3>Staff notes <span class="count-pill">${job.notes.length}</span></h3><span class="private-tag">${icon('shield')} Staff only</span></div><div class="notes">${job.notes.length ? job.notes.map(note => `<article class="note"><div>${avatar(userById(note.author), true)}<strong>${escape(userById(note.author)?.name || 'Staff')}</strong><time>${stamp(note.at)}</time></div><p>${escape(note.text)}</p></article>`).join('') : '<p class="muted">No notes yet. Add a diagnosis, parts used, or a handoff for the team.</p>'}</div><form id="note-form"><label class="sr-only" for="note-text">New staff note</label><textarea id="note-text" name="note" maxlength="2000" rows="3" placeholder="What should the team know?" required></textarea><div class="note-footer"><span class="field-hint">Internal notes · up to 2,000 characters</span><button class="button primary" type="submit">Add note ${icon('arrow')}</button></div><p class="form-error" id="note-error" role="alert"></p></form></section>`}</div><div class="dialog-footer">${icon('shield')} Sample customer data · internal workspace</div>`;
}
function localDateTime(value) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function openCustomer(id) {
  if (!visibleJobs(state, user).some(job => job.customerId === id)) return;
  const customer = customerById(id); selectedJob = null; customerSelection = id;
  dialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">CUSTOMER PROFILE</span><button class="icon-button" data-action="close-dialog" aria-label="Close customer profile">${icon('close')}</button></div><div class="dialog-heading"><span class="avatar neutral">${escape(initials(customer.name))}</span><h2 id="detail-title">${escape(customer.name)}</h2><p>${escape(customer.email)} · ${customer.phone}</p></div><div class="dialog-body">${historyContent(customer)}</div><div class="dialog-footer">${icon('shield')} Sample customer data · staff only</div>`;
  if (!dialog.open) dialog.showModal();
}
function clearFilters() { statusFilter = 'all'; staffFilter = 'all'; dateFilter = 'all'; search = ''; }
async function saveStatus(status) {
  const id = selectedJob, revision = state.jobs.find(job => job.id === id).revision;
  try { applySnapshot(await mutate(`/api/jobs/${id}`, 'PATCH', { revision, changes: { status } })); render(); renderDetail(); toast(`Job #${id} marked ${status.toLowerCase()}.`); }
  catch (error) { toast(error.message); try { await refreshWorkspace(); renderDetail(); } catch { /* Keep the displayed data until the connection returns. */ } }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || busy) return;
  const { action, id } = target.dataset;
  try {
    if (action === 'logout') { await mutate('/api/logout', 'POST', {}); location.reload(); }
    else if (!user) return;
    else if (action === 'nav') { page = target.dataset.page; clearFilters(); if (page === 'team') teamState = await api('/api/team'); render(); }
    else if (action === 'open-job') openJob(id);
    else if (action === 'open-customer') openCustomer(id);
    else if (action === 'close-dialog') dialog.close();
    else if (action === 'detail-tab') { detailTab = target.dataset.tab; renderDetail(); dialog.querySelector(`[data-tab="${detailTab}"]`).focus(); }
    else if (action === 'next-status') await saveStatus(target.dataset.status);
    else if (action === 'clear-filters') { clearFilters(); render(); }
    else if (action === 'filter-unassigned') { clearFilters(); staffFilter = 'unassigned'; render(); }
    else if (action === 'stat-filter') { clearFilters(); const filter = target.dataset.filter; if (filter === 'today') dateFilter = 'today'; if (filter === 'progress') statusFilter = 'In Progress'; if (filter === 'done') { statusFilter = 'Done'; dateFilter = 'today'; } if (filter === 'overdue') dateFilter = 'overdue'; render(); }
    else if (action === 'read-all') { applySnapshot(await mutate('/api/alerts/read', 'POST', {})); render(); }
    else if (action === 'open-alert') { const alert = myAlerts().find(item => item.id === id); if (!alert) return; applySnapshot(await mutate('/api/alerts/read', 'POST', { id })); render(); openJob(alert.jobId); }
    else if (action === 'revoke-invite') { await mutate(`/api/invitations/${id}`, 'DELETE', {}); inviteLink = ''; teamState = await api('/api/team'); render(); toast('Invitation revoked.'); }
    else if (action === 'toggle-member') { const member = teamState.users.find(item => item.id === id); await mutate(`/api/team/${id}`, 'PATCH', { disabled: !member.disabled }); await refreshWorkspace(); render(); toast(member.disabled ? 'Account access restored.' : 'Account disabled and sessions ended.'); }
    else if (action === 'copy-invite') { try { await navigator.clipboard.writeText(inviteLink); toast('Invitation link copied.'); } catch { document.querySelector('#invite-link').select(); toast('Select and copy the invitation link.'); } }
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => { if (event.target.id === 'job-search') { search = event.target.value; document.querySelector('#job-results').innerHTML = jobResults(); } });
document.addEventListener('change', event => {
  if (busy) return;
  if (event.target.id === 'invite-profile') {
    const member = teamState.users.find(item => item.id === event.target.value);
    if (member) { document.querySelector('#invite-name').value = member.name; document.querySelector('#invite-role').value = member.role; }
    return;
  }
  if (event.target.id === 'status-filter') statusFilter = event.target.value;
  else if (event.target.id === 'staff-filter') staffFilter = event.target.value;
  else if (event.target.id === 'date-filter') dateFilter = event.target.value;
  else if (event.target.id === 'job-status') { saveStatus(event.target.value); return; }
  else return;
  document.querySelector('#job-results').innerHTML = jobResults();
});
document.addEventListener('submit', async event => {
  if (!['note-form', 'schedule-form', 'invite-form'].includes(event.target.id)) return;
  event.preventDefault();
  if (busy) return;
  const form = event.target, data = new FormData(form);
  const errorElement = form.querySelector('.form-error');
  if (errorElement) errorElement.textContent = '';
  try {
    if (form.id === 'invite-form') {
      const invitation = await mutate('/api/invitations', 'POST', Object.fromEntries(data));
      inviteLink = `${location.origin}/#invite=${invitation.token}`;
      teamState = await api('/api/team'); render(); document.querySelector('#invite-link').focus(); toast('Invitation ready to share.');
    } else if (form.id === 'note-form') {
      applySnapshot(await mutate(`/api/jobs/${selectedJob}/notes`, 'POST', { note: data.get('note') })); render(); renderDetail(); dialog.querySelector('#note-text').focus(); toast('Staff note saved.');
    } else {
      const job = state.jobs.find(item => item.id === selectedJob);
      const scheduled = new Date(data.get('scheduled')).toISOString();
      applySnapshot(await mutate(`/api/jobs/${selectedJob}`, 'PATCH', { revision: job.revision, changes: { assignee: data.get('assignee') || null, scheduled } }));
      render(); renderDetail(); toast('Assignment and appointment saved.');
    }
  } catch (error) { if (errorElement) errorElement.textContent = error.message; else toast(error.message); if (error.status === 409) { try { await refreshWorkspace(); } catch {} } }
});

dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
render();
let syncing = false;
async function syncWorkspace() {
  if (syncing || busy || document.hidden) return;
  syncing = true;
  try {
    const session = await api('/api/session');
    if (!session.user) { user = null; dialog.close(); app.replaceChildren(); location.reload(); return; }
    if (dialog.open || document.activeElement?.matches('input, textarea, select') || inviteLink) return;
    const before = JSON.stringify([state, teamState]);
    if (!await refreshWorkspace(true)) return;
    storageWarning = '';
    if (before !== JSON.stringify([state, teamState]) || document.querySelector('.storage-warning')) render();
  } catch { storageWarning = 'Connection interrupted. Changes cannot be saved until the server is available.'; if (!dialog.open && !document.activeElement?.matches('input, textarea, select')) render(); }
  finally { syncing = false; }
}
setInterval(syncWorkspace, 10000);
window.addEventListener('focus', syncWorkspace);
