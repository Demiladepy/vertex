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

// ── Individual stat card ───────────────────────────────────────────────────

function MetricCard({ icon, value, label, sub, variant }) {
  return (
    <div className={`${styles.card} ${variant ? styles[variant] : ''}`}>
      <div className={styles.iconWrap}>
        {icon}
      </div>
      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <span className={styles.label}>{label}</span>
      </div>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}

// ── Icon components ────────────────────────────────────────────────────────

const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 15.5" />
  </svg>
);

const IconNodes = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="5"  r="2.5" />
    <circle cx="5"  cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <line x1="12" y1="7.5" x2="6.5" y2="17" />
    <line x1="12" y1="7.5" x2="17.5" y2="17" />
    <line x1="7.5" y1="19" x2="16.5" y2="19" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const IconSignal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M2 20h.01M7 20v-4M12 20V10M17 20V4M22 20v-8" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 2l7 3.5v5C19 15.4 16 20 12 22 8 20 5 15.4 5 10.5V5.5L12 2z" />
  </svg>
);

// ── Main component ─────────────────────────────────────────────────────────

export default function MetricsBar({ metrics, agentCount, isHalted }) {
  const m      = metrics ?? {};
  const latVal = m.avg_bid_latency_ms ?? 0;
  const onlineCount = typeof agentCount === 'number' ? agentCount : (m.agent_count ?? 0);

  const agentsVariant = onlineCount >= 5 ? 'green'
                      : onlineCount  > 0 ? 'amber'
                      : 'red';

  const latencyVariant = latVal === 0 ? ''
                       : latVal < 300 ? 'green'
                       : latVal < 800 ? 'amber'
                       : 'red';

  const safetyVariant  = (m.safety_events ?? 0) > 0 ? 'red' : 'green';

  return (
    <div className={`${styles.bar} ${isHalted ? styles.barHalted : ''}`}>

      <MetricCard
        icon={<IconClock />}
        value={formatUptime(m.uptime_seconds ?? 0)}
        label="Uptime"
        sub="swarm"
        variant=""
      />

      <MetricCard
        icon={<IconNodes />}
        value={`${onlineCount}/5`}
        label="Agents"
        sub={onlineCount >= 5 ? 'mesh ready' : onlineCount > 0 ? 'connecting' : 'offline'}
        variant={agentsVariant}
      />

      <MetricCard
        icon={<IconCheck />}
        value={m.tasks_completed ?? 0}
        label="Tasks done"
        sub={m.tasks_completed > 0 ? 'completed' : 'none yet'}
        variant="blue"
      />

      <MetricCard
        icon={<IconSignal />}
        value={latVal > 0 ? `${latVal}ms` : '—'}
        label="Bid latency"
        sub={latVal === 0 ? 'no data' : latVal < 300 ? 'fast' : latVal < 800 ? 'moderate' : 'slow'}
        variant={latencyVariant}
      />

      <MetricCard
        icon={<IconShield />}
        value={m.safety_events ?? 0}
        label="Safety events"
        sub={(m.safety_events ?? 0) > 0 ? 'review log' : 'all clear'}
        variant={safetyVariant}
      />

    </div>
  );
}
