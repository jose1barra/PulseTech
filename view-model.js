export const STATUSES = ['Requested', 'Confirmed', 'En Route', 'In Progress', 'Done', 'Cancelled', 'Rescheduled'];
export const canAccess = (user, job) => Boolean(user && job && (user.role === 'manager' || job.assignee === user.id));
export const visibleJobs = (state, user) => state.jobs.filter(job => canAccess(user, job));
export const isOverdue = (job, now = new Date()) => new Date(job.scheduled) < now && job.status !== 'Done';
export const allowedStatuses = job => STATUSES.filter(status => status !== 'En Route' || job.location === 'On-site');
export function nextStatus(job) {
  const flow = ['Requested', 'Confirmed', ...(job.location === 'On-site' ? ['En Route'] : []), 'In Progress', 'Done'];
  return job.status === 'Rescheduled' ? 'Confirmed' : flow[flow.indexOf(job.status) + 1] && flow.includes(job.status) ? flow[flow.indexOf(job.status) + 1] : null;
}
