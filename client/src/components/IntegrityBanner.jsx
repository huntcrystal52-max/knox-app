import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// Shows across the top of every room while Knox's integrity protocol has an
// open alert. Rechecks every minute so a new warning appears without a reload.
export default function IntegrityBanner() {
  const [open, setOpen] = useState([]);

  useEffect(() => {
    let cancelled = false;
    function check() {
      api
        .getIntegrity()
        .then((data) => { if (!cancelled) setOpen(data.open || []); })
        .catch(() => {});
    }
    check();
    const interval = setInterval(check, 60000);
    window.addEventListener('integrity-changed', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('integrity-changed', check);
    };
  }, []);

  if (!open.length) return null;

  const worst = open.some((a) => a.level === 'critical') ? 'critical'
    : open.some((a) => a.level === 'repeated') ? 'repeated' : 'minor';
  const text = worst === 'critical'
    ? 'Critical: something in Knox needs looking at. Autonomy is paused and chat is in careful mode.'
    : worst === 'repeated'
      ? 'Repeated drift noticed. Autonomy is paused and chat is in careful mode.'
      : `${open.length} minor note${open.length === 1 ? '' : 's'} from his integrity check.`;

  return (
    <Link to="/integrity" className={`integrity-banner integrity-banner--${worst}`}>
      {text} <span className="integrity-banner-link">Look →</span>
    </Link>
  );
}
