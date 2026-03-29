import { useCallback, useState } from 'react';

let _nid = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);

  const add = useCallback((type, message, duration = 4000) => {
    const id = ++_nid;
    setNotifications(n => [...n, { id, type, message }]);
    setTimeout(() => {
      setNotifications(n => n.filter(x => x.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications(n => n.filter(x => x.id !== id));
  }, []);

  return { notifications, add, dismiss };
}
