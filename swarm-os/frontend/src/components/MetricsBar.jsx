import styles from './MetricsBar.module.css';

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function cardHealthClass(value, type) {
  switch (type) {
    case 'uptime':   return value > 0 ? styles.cardHealthy : '';
    case 'latency':  return value === 0 ? '' : value < 300 ? styles.cardHealthy : value < 800 ? styles.cardAmber : styles.cardCritical;
    case 'safety':   return value === 0 ? styles.cardHealthy : styles.cardCritical;
    default:         return value > 0 ? styles.cardHealthy : '';
  }
}

function StatCard({ value, label, healthType }) {
  const cls = cardHealthClass(value, healthType);
  return (
    <div className={`${styles.card} ${cls}`}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

export default function MetricsBar({ metrics }) {
  const m = metrics ?? {};
  return (
    <div className={styles.bar}>
      <StatCard
        value={formatUptime(m.uptime_seconds ?? 0)}
        label="Swarm uptime"
        healthType="uptime"
      />
      <StatCard
        value={m.tasks_completed ?? 0}
        label="Tasks completed"
        healthType="tasks"
      />
      <StatCard
        value={`${m.avg_bid_latency_ms ?? 0}ms`}
        label="Avg bid latency"
        healthType="latency"
      />
      <StatCard
        value={m.safety_events ?? 0}
        label="Safety events"
        healthType="safety"
      />
    </div>
  );
}
