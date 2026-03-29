import styles from './Notifications.module.css';

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

export default function Notifications({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div className={styles.container}>
      {notifications.map(n => (
        <div key={n.id} className={`${styles.toast} ${styles[n.type]}`}>
          <span className={styles.icon}>{ICONS[n.type] ?? 'ℹ'}</span>
          <span className={styles.message}>{n.message}</span>
          <button className={styles.close} onClick={() => onDismiss(n.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
