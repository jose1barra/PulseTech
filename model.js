export const STATUSES = ['Requested', 'Confirmed', 'En Route', 'In Progress', 'Done', 'Cancelled', 'Rescheduled'];
export const STAFF = [
  { id: 'alex', name: 'Alex Morgan', role: 'manager', title: 'Store manager', initials: 'AM', color: 'purple' },
  { id: 'jamie', name: 'Jamie Chen', role: 'tech', title: 'Installation specialist', initials: 'JC', color: 'orange' },
  { id: 'sam', name: 'Sam Rivera', role: 'tech', title: 'Support technician', initials: 'SR', color: 'blue' },
  { id: 'taylor', name: 'Taylor Brooks', role: 'tech', title: 'Repair technician', initials: 'TB', color: 'green' },
];
export const CUSTOMERS = [
  { id: 'c1', name: 'Olivia Bennett', email: 'olivia@example.com', phone: '(415) 555-0101', address: '124 Maple Street, San Francisco, CA', devices: ['Nest Learning Thermostat', 'Google Nest Hub'], orders: ['Nest Learning Thermostat · Purchased Aug 12, 2026', 'Google Nest Hub · Purchased Jul 03, 2026'], history: ['Jul 06, 2026 · Smart display setup · Done'] },
  { id: 'c2', name: 'Marcus Williams', email: 'marcus@example.com', phone: '(415) 555-0102', address: '890 Valencia Street, San Francisco, CA', devices: ['MacBook Air M2', 'HP Envy 6055e'], orders: ['MacBook Air M2 · Purchased Jun 20, 2026'], history: ['Jun 21, 2026 · New laptop setup · Done'] },
  { id: 'c3', name: 'Sofia Patel', email: 'sofia@example.com', phone: '(415) 555-0103', address: '52 Cedar Avenue, San Francisco, CA', devices: ['Ring Video Doorbell', 'Eero Pro 6E'], orders: ['Ring Video Doorbell · Purchased Aug 30, 2026', 'Eero Pro 6E · Purchased May 10, 2026'], history: ['May 12, 2026 · Home Wi-Fi installation · Done'] },
  { id: 'c4', name: 'Ethan Davis', email: 'ethan@example.com', phone: '(415) 555-0104', address: '317 Oak Street, San Francisco, CA', devices: ['iPhone 14', 'iPad Air'], orders: ['iPhone 14 · Purchased Apr 15, 2026'], history: ['Apr 15, 2026 · Device setup · Done'] },
  { id: 'c5', name: 'Isabella Kim', email: 'isabella@example.com', phone: '(415) 555-0105', address: '76 Pine Lane, San Francisco, CA', devices: ['Philips Hue Starter Kit', 'Apple HomePod mini'], orders: ['Philips Hue Starter Kit · Purchased Sep 02, 2026'], history: [] },
  { id: 'c6', name: 'Noah Thompson', email: 'noah@example.com', phone: '(415) 555-0106', address: '209 Hayes Street, San Francisco, CA', devices: ['Dell XPS 13'], orders: ['Dell XPS 13 · Purchased Feb 18, 2026'], history: ['Feb 20, 2026 · Data migration · Done'] },
];

export function seedState(now = new Date()) {
  const time = (day, hour, minute = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour, minute).toISOString();
  const definitions = [
    ['1041', 'c1', 'Installation', 'Nest thermostat installation', 'Nest Learning Thermostat', 'On-site', 'jamie', 'Confirmed', 0, 9, 0, 'Replace the existing thermostat and connect it to the Google Home app. The customer will be home all morning.'],
    ['1042', 'c2', 'Setup & Support', 'Printer & laptop setup', 'HP Envy 6055e', 'Remote', 'sam', 'In Progress', 0, 10, 30, 'Printer disconnects from the laptop after sleep. Please check the wireless connection and drivers.'],
    ['1043', 'c3', 'Installation', 'Video doorbell installation', 'Ring Video Doorbell', 'On-site', 'jamie', 'En Route', 0, 11, 30, 'Install at the front entrance. Existing doorbell wiring is available. Ring the side entrance on arrival.'],
    ['1044', 'c4', 'Repair', 'iPhone screen repair', 'iPhone 14', 'In-store', 'taylor', 'Requested', 0, 13, 0, 'Screen cracked after a drop. Touch input still works. Inspect the frame and confirm replacement parts.'],
    ['1045', 'c5', 'Installation', 'Smart lighting setup', 'Philips Hue Starter Kit', 'On-site', null, 'Requested', 0, 14, 30, 'Set up three living room lights and connect the Hue bridge to Apple Home.'],
    ['1046', 'c6', 'Setup & Support', 'Laptop performance check', 'Dell XPS 13', 'In-store', 'sam', 'Confirmed', 0, 16, 0, 'Laptop runs slowly and the fan stays on. Customer will bring the charger.'],
    ['1047', 'c4', 'Setup & Support', 'iPad account setup', 'iPad Air', 'Remote', 'sam', 'Done', -1, 15, 0, 'Help configure cloud backup and email.'],
    ['1048', 'c1', 'Installation', 'Nest Hub configuration', 'Google Nest Hub', 'On-site', 'jamie', 'Confirmed', 1, 10, 0, 'Connect the display to the home network and configure household controls.'],
    ['1049', 'c6', 'Repair', 'Laptop battery replacement', 'Dell XPS 13', 'In-store', 'taylor', 'Rescheduled', 1, 13, 0, 'Battery replacement appointment moved at the customer’s request.'],
    ['1050', 'c5', 'Setup & Support', 'HomePod troubleshooting', 'Apple HomePod mini', 'Remote', 'sam', 'Cancelled', -1, 11, 0, 'Customer resolved the connection issue and cancelled the appointment.'],
  ];
  return { version: 1, jobs: definitions.map(([id, customerId, service, title, device, location, assignee, status, day, hour, minute, description]) => ({ id, customerId, service, title, device, location, assignee, status, scheduled: time(day, hour, minute), duration: 60, description, notes: id === '1042' ? [{ author: 'sam', text: 'Connected with the customer. Checking the printer network settings.', at: time(0, 10, 35) }] : [], activity: [{ text: 'Booking received', at: time(-2, 9), author: null }] })), alerts: [
    { id: 'welcome-manager', userId: 'alex', jobId: '1045', text: 'Smart lighting setup needs a technician.', at: time(0, 8), read: false },
    { id: 'welcome-jamie', userId: 'jamie', jobId: '1041', text: 'You’re assigned to Nest thermostat installation.', at: time(0, 8), read: false },
    { id: 'welcome-sam', userId: 'sam', jobId: '1042', text: 'You’re assigned to Printer & laptop setup.', at: time(0, 8), read: false },
    { id: 'welcome-taylor', userId: 'taylor', jobId: '1044', text: 'You’re assigned to iPhone screen repair.', at: time(0, 8), read: false },
  ] };
}

export const userById = id => STAFF.find(user => user.id === id);
export const customerById = id => CUSTOMERS.find(customer => customer.id === id);
export const canAccess = (user, job) => Boolean(user && job && (user.role === 'manager' || job.assignee === user.id));
export const visibleJobs = (state, user) => state.jobs.filter(job => canAccess(user, job));
export const isOverdue = (job, now = new Date()) => new Date(job.scheduled) < now && job.status !== 'Done';
export const allowedStatuses = job => STATUSES.filter(status => status !== 'En Route' || job.location === 'On-site');
export function nextStatus(job) {
  const flow = ['Requested', 'Confirmed', ...(job.location === 'On-site' ? ['En Route'] : []), 'In Progress', 'Done'];
  return job.status === 'Rescheduled' ? 'Confirmed' : flow[flow.indexOf(job.status) + 1] && flow.includes(job.status) ? flow[flow.indexOf(job.status) + 1] : null;
}
export function conflictFor(state, jobId, assignee, scheduled, duration = 60) {
  if (!assignee) return null;
  const start = new Date(scheduled).getTime();
  return state.jobs.find(job => job.id !== jobId && job.assignee === assignee && !['Done', 'Cancelled'].includes(job.status) && start < new Date(job.scheduled).getTime() + job.duration * 60000 && start + duration * 60000 > new Date(job.scheduled).getTime());
}
export function updateJob(state, user, id, changes, now = new Date()) {
  const job = state.jobs.find(item => item.id === id);
  if (!canAccess(user, job)) throw new Error('This job is not available to your account.');
  const keys = Object.keys(changes);
  if (keys.some(key => !['status', 'assignee', 'scheduled'].includes(key))) throw new Error('Unsupported job update.');
  if (user.role !== 'manager' && keys.some(key => key !== 'status')) throw new Error('Only managers can assign or reschedule jobs.');
  const updated = { ...job, ...changes };
  if (!allowedStatuses(job).includes(updated.status)) throw new Error('That status is not available for this service location.');
  if (updated.assignee !== null && !STAFF.some(person => person.id === updated.assignee && person.role === 'tech')) throw new Error('Choose a valid technician.');
  if (!Number.isFinite(new Date(updated.scheduled).getTime())) throw new Error('Choose a valid appointment time.');
  const scheduleChanged = updated.scheduled !== job.scheduled;
  const assignmentChanged = updated.assignee !== job.assignee;
  if ((scheduleChanged || assignmentChanged || (['Done', 'Cancelled'].includes(job.status) && !['Done', 'Cancelled'].includes(updated.status))) && !['Done', 'Cancelled'].includes(updated.status)) {
    const conflict = conflictFor(state, id, updated.assignee, updated.scheduled, updated.duration);
    if (conflict) throw new Error(`This technician already has job #${conflict.id} during that hour. Choose another time or technician.`);
  }
  const messages = [];
  if (assignmentChanged) messages.push(updated.assignee ? `Assigned to ${userById(updated.assignee).name}` : 'Assignment removed');
  if (scheduleChanged) messages.push(`Appointment changed to ${new Date(updated.scheduled).toLocaleString()}`);
  if (updated.status !== job.status) messages.push(`Status changed to ${updated.status}`);
  if (!messages.length) return state;
  updated.activity = [...job.activity, ...messages.map(text => ({ text, author: user.id, at: now.toISOString() }))];
  const alerts = [...state.alerts];
  if (assignmentChanged || scheduleChanged) {
    for (const userId of new Set([job.assignee, updated.assignee].filter(Boolean))) {
      const text = userId !== updated.assignee ? `You’re no longer assigned to ${job.title}.` : `${assignmentChanged ? 'Assignment updated' : 'Appointment time changed'}: ${job.title}.`;
      alerts.unshift({ id: `${now.getTime()}-${id}-${userId}-${alerts.length}`, userId, jobId: id, text, at: now.toISOString(), read: false });
    }
  }
  return { ...state, jobs: state.jobs.map(item => item.id === id ? updated : item), alerts };
}
export function addNote(state, user, id, text, now = new Date()) {
  const job = state.jobs.find(item => item.id === id);
  if (!canAccess(user, job)) throw new Error('This job is not available to your account.');
  const value = text.trim();
  if (!value) throw new Error('Write a note before saving.');
  if (value.length > 2000) throw new Error('Notes must be 2,000 characters or fewer.');
  return { ...state, jobs: state.jobs.map(item => item.id === id ? { ...item, notes: [...item.notes, { author: user.id, text: value, at: now.toISOString() }] } : item) };
}
