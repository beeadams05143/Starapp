export function dashboardClock(now = new Date()) {
  const hour = now.getHours();
  return {
    greeting: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export function startDashboardClock(doc = document, win = window, now = () => new Date()) {
  const update = () => {
    const value = dashboardClock(now());
    const greeting = doc.getElementById('dashboardGreeting');
    const date = doc.getElementById('dashboardDate');
    if (greeting) greeting.textContent = value.greeting;
    if (date) date.textContent = value.date;
  };
  update();
  // Re-read wall time rather than adding 24 hours: DST, sleep, and zone changes
  // all use the browser's current local calendar and clock.
  const timer = win.setInterval(update, 1000);
  doc.addEventListener('visibilitychange', update);
  win.addEventListener('pageshow', update);
  win.addEventListener('focus', update);
  return () => {
    win.clearInterval(timer);
    doc.removeEventListener('visibilitychange', update);
    win.removeEventListener('pageshow', update);
    win.removeEventListener('focus', update);
  };
}

if (typeof document !== 'undefined') startDashboardClock();
