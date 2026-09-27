// The day the app shell first went live — the counter badge counts up from
// here, so it reflects how long Flame has actually been running.
const LAUNCH_DATE = new Date('2026-09-18T00:00:00Z');

function daysLive() {
  const diffMs = Date.now() - LAUNCH_DATE.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

export default function LiveCounter() {
  return (
    <div className="live-counter" title="Days since Flame went live">
      Day {daysLive()}
    </div>
  );
}
