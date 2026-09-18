import { useEffect, useState } from 'react';
import { api } from './api.js';

export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch((err) => {
        setError(err);
        setUser(null);
      });
  }, []);

  return { user, loading: user === undefined, error };
}
