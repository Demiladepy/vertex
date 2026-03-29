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

function healthClass(value, type) {
  switch (type) {
    case 'uptime':  return value > 0 ? styles.healthy : '';
    case 'latency': return value === 0 ? '' : value < 300 ? styles.healthy : value < 800 ? styles.amber : styles.critical;
    case 'safety':  return value === 0 ? styles.healthy : styles.critical;
    case 'agents':  return value >= 5 ? styles.healthy : value > 0 ? styles.amber : styles.critical;
    default:        return value > 0 ? styles.healthy : '';
  }
}

function StatCard({ value, label, healthType, sub }) {
  const cls = healthClass(typeof value === 'string' ? parseFloat(value) || 0 : value, healthType);
  return (
    <div className={`${styles.card} ${cls}`}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}

export default function MetricsBar({ metrics, agentCount }) {
  const m = metrics ?? {};
  const latVal = m.avg_bid_latency_ms ?? 0;
  return (
    <div className={styles.bar}>
      <StatCard
        value={formatUptime(m.uptime_seconds ?? 0)}
        label="Swarm uptime"
        healthType="uptime"
      />
      <StatCard
        value={`${agentCount ?? m.agent_count ?? 0}/5`}
        label="Agents online"
        healthType="agents"
        sub={agentCount >= 5 ? 'mesh ready' : 'connecting…'}
      />
      <StatCard
        value={m.tasks_completed ?? 0}
        label="Tasks completed"
        healthType="tasks"
      />
      <StatCard
        value={`${latVal}ms`}
        label="Avg bid latency"
        healthType="latency"
        sub={latVal === 0 ? '' : latVal < 300 ? 'fast' : latVal < 800 ? 'moderate' : 'slow'}
      />
      <StatCard
        value={m.safety_events ?? 0}
        label="Safety events"
        healthType="safety"
        sub={m.safety_events > 0 ? 'review log' : 'all clear'}
      />
    </div>
  );
}
