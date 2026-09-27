import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Checks whether Knox-bot is actually reachable, and keeps rechecking every
// 30s so the dot stays honest while the app's open — this is a live status,
// not a one-time check on load.
export default function LiveStatus() {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function check() {
      api
        .getStatus()
        .then((data) => {
          if (!cancelled) setOnline(!!data.online);
        })
        .catch(() => {
          if (!cancelled) setOnline(false);
        });
    }

    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (online === null) return null;

  return (
    <div className={'live-status ' + (online ? 'live-status--online' : 'live-status--offline')}>
      <span className="live-status-dot" />
      {online ? 'Live' : 'Away'}
    </div>
  );
}
