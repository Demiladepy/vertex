import styles from './NavBar.module.css';

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'tasks',     label: 'Tasks',     icon: '⊞' },
  { id: 'safety',    label: 'Safety',    icon: '⚑' },
];

export default function NavBar({ view, onViewChange, safetyCount, isHalted, taskCount }) {
  return (
    <nav className={styles.nav}>
      {VIEWS.map(v => (
        <button
          key={v.id}
          className={`${styles.tab} ${view === v.id ? styles.active : ''}`}
          onClick={() => onViewChange(v.id)}
        >
          <span className={styles.tabIcon}>{v.icon}</span>
          {v.label}
          {v.id === 'safety' && safetyCount > 0 && (
            <span className={`${styles.badge} ${isHalted ? styles.badgeRed : styles.badgeAmber}`}>
              {safetyCount}
            </span>
          )}
          {v.id === 'tasks' && taskCount > 0 && (
            <span className={styles.badge}>{taskCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
