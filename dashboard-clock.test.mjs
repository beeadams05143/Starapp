import assert from 'node:assert/strict';
import { dashboardClock, startDashboardClock } from './dashboard-clock.js';
const old = process.env.TZ;
try {
  for (const zone of ['America/New_York', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'UTC']) {
    process.env.TZ = zone;
    assert.deepEqual(dashboardClock(new Date(2026, 9, 19, 9)), { date: 'Monday, October 19', greeting: 'Good morning' });
    assert.equal(dashboardClock(new Date(2026, 9, 19, 12)).greeting, 'Good afternoon');
    assert.equal(dashboardClock(new Date(2026, 9, 19, 18)).greeting, 'Good evening');
    const before = new Date(2026, 9, 19, 23, 59, 59);
    assert.equal(dashboardClock(new Date(before.getTime() + 1000)).date, 'Tuesday, October 20');
  }
  process.env.TZ = 'America/New_York';
  for (const instant of ['2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z']) {
    assert.equal(dashboardClock(new Date(instant)).date, 'Sunday, March 8');
    assert.equal(dashboardClock(new Date(instant)).greeting, 'Good morning');
  }
  for (const instant of ['2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z']) assert.equal(dashboardClock(new Date(instant)).date, 'Sunday, November 1');
  const nodes = { dashboardGreeting: {}, dashboardDate: {} }, events = new Map();
  let tick, cleared = false, time = new Date(2026, 9, 19, 11, 59, 59);
  const target = { addEventListener: (key, value) => events.set(key, value), removeEventListener: key => events.delete(key) };
  const stop = startDashboardClock({ ...target, getElementById: id => nodes[id] }, {
    ...target, setInterval: callback => { tick = callback; return 1; }, clearInterval: () => { cleared = true; },
  }, () => time);
  time = new Date(2026, 9, 19, 12); tick();
  assert.equal(nodes.dashboardGreeting.textContent, 'Good afternoon');
  time = new Date(2026, 9, 20, 0); events.get('pageshow')();
  assert.equal(nodes.dashboardDate.textContent, 'Tuesday, October 20');
  assert.equal(nodes.dashboardGreeting.textContent, 'Good morning');
  stop(); assert.ok(cleared); assert.equal(events.size, 0);
} finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
console.log('Dashboard local clock, greetings, midnight, DST, and resume: PASS');
