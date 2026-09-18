import test from 'node:test';
import assert from 'node:assert/strict';
import { STAFF, seedState, visibleJobs, canAccess, isOverdue, allowedStatuses, nextStatus, updateJob, addNote } from '../model.js';
const now = new Date('2026-09-18T12:00:00');
const manager = STAFF[0], jamie = STAFF[1], sam = STAFF[2];

test('technicians see only assigned jobs; managers see all jobs', () => {
  const state = seedState(now);
  assert.equal(visibleJobs(state, manager).length, 10);
  assert.ok(visibleJobs(state, jamie).every(job => job.assignee === jamie.id));
  assert.equal(canAccess(null, state.jobs[0]), false);
  assert.equal(canAccess(sam, state.jobs[0]), false);
  assert.throws(() => updateJob(state, sam, '1041', { status: 'Done' }), /not available/);
  assert.throws(() => addNote(state, sam, '1041', 'Private note'), /not available/);
  assert.throws(() => updateJob(state, jamie, '1041', { assignee: 'sam' }), /Only managers/);
  assert.throws(() => updateJob(state, jamie, '1041', { scheduled: now.toISOString() }), /Only managers/);
});
test('status flow skips En Route for remote and in-store jobs', () => {
  const state = seedState(now);
  const remote = state.jobs.find(job => job.id === '1042');
  assert.ok(!allowedStatuses(remote).includes('En Route'));
  assert.equal(nextStatus({ ...remote, status: 'Confirmed' }), 'In Progress');
  assert.equal(nextStatus({ ...remote, status: 'Done' }), null);
  assert.equal(nextStatus({ ...remote, status: 'Cancelled' }), null);
  assert.equal(nextStatus({ ...remote, status: 'Rescheduled' }), 'Confirmed');
  assert.equal(nextStatus(state.jobs[0]), 'En Route');
  assert.throws(() => updateJob(state, sam, '1042', { status: 'En Route' }), /not available/);
});
test('overdue follows the requested rule, including cancelled jobs', () => {
  const job = { scheduled: new Date(now.getTime() - 1).toISOString(), status: 'Cancelled' };
  assert.equal(isOverdue(job, now), true);
  assert.equal(isOverdue({ ...job, status: 'Done' }, now), false);
  assert.equal(isOverdue({ ...job, scheduled: new Date(now.getTime() + 1).toISOString() }, now), false);
});
test('manager reassignments notify both affected technicians and change visibility', () => {
  const state = seedState(now);
  const next = updateJob(state, manager, '1041', { assignee: 'sam' }, now);
  assert.equal(next.jobs[0].assignee, 'sam');
  assert.equal(state.jobs[0].assignee, 'jamie');
  assert.equal(canAccess(jamie, next.jobs[0]), false);
  assert.equal(canAccess(sam, next.jobs[0]), true);
  assert.equal(next.alerts.length, state.alerts.length + 2);
  assert.deepEqual(new Set(next.alerts.slice(0, 2).map(alert => alert.userId)), new Set(['jamie', 'sam']));
});
test('overlapping bookings are rejected, adjacent bookings are accepted', () => {
  const state = seedState(now);
  const other = state.jobs.find(job => job.id === '1043');
  assert.throws(() => updateJob(state, manager, '1041', { scheduled: other.scheduled, status: 'Rescheduled' }, now), /already has job/);
  const adjacent = new Date(new Date(other.scheduled).getTime() - 60 * 60000).toISOString();
  assert.doesNotThrow(() => updateJob(state, manager, '1041', { scheduled: adjacent, status: 'Rescheduled' }, now));
});
test('rescheduling persists the appointment and alerts the assigned technician', () => {
  const state = seedState(now);
  const scheduled = new Date(2026, 8, 21, 15).toISOString();
  const next = updateJob(state, manager, '1041', { scheduled, status: 'Rescheduled' }, now);
  assert.equal(next.jobs[0].scheduled, scheduled);
  assert.equal(next.jobs[0].status, 'Rescheduled');
  assert.equal(next.alerts[0].userId, 'jamie');
  assert.match(next.alerts[0].text, /Appointment time changed/);
  assert.equal(next.jobs[0].activity.length, 3);
});
test('notes preserve authorship and reject empty or excessively long input', () => {
  const state = seedState(now);
  const next = addNote(state, jamie, '1041', '  Wiring checked.\nInstalled thermostat.  ', now);
  assert.equal(state.jobs[0].notes.length, 0);
  assert.deepEqual(next.jobs[0].notes[0], { author: jamie.id, text: 'Wiring checked.\nInstalled thermostat.', at: now.toISOString() });
  assert.throws(() => addNote(state, jamie, '1041', '   '), /Write a note/);
  assert.throws(() => addNote(state, jamie, '1041', 'x'.repeat(2001)), /2,000/);
});
test('invalid edits are rejected and no-op saves do not generate alerts', () => {
  const state = seedState(now);
  assert.throws(() => updateJob(state, manager, '1041', { scheduled: 'invalid' }), /valid appointment/);
  assert.throws(() => updateJob(state, manager, '1041', { assignee: 'alex' }), /valid technician/);
  assert.throws(() => updateJob(state, manager, '1041', { description: 'overwrite' }), /Unsupported/);
  assert.equal(updateJob(state, manager, '1041', { assignee: 'jamie' }), state);
});
