import styles from './SafetyLog.module.css';

function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 1000)   return 'just now';
  if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function AckBadge({ ack }) {
  return (
    <div className={styles.ackBadge}>
      <span className={styles.ackAgent}>{ack.agent_id}</span>
      <span className={styles.ackMs}>{ack.latency_ms}ms</span>
    </div>
  );
}

function EventCard({ event, latest }) {
  return (
    <div className={`${styles.card} ${latest ? styles.cardLatest : ''}`}>
      {latest && <span className={styles.latestTag}>LATEST</span>}
      <div className={styles.cardHeader}>
        <span className={styles.faultType}>{event.fault_type ?? 'unknown_fault'}</span>
        <span className={styles.cardTime}>{fmtTime(event.detected_at_ms)}</span>
        <span className={styles.cardAge}>{timeAgo(event.detected_at_ms)}</span>
      </div>
      <div className={styles.source}>
        Source: <span className={styles.sourceId}>{event.source_agent_id ?? '—'}</span>
      </div>
      {event.acks?.length > 0 ? (
        <div className={styles.ackSection}>
          <span className={styles.ackLabel}>ACKs ({event.acks.length})</span>
          <div className={styles.ackList}>
            {[...event.acks]
              .sort((a, b) => a.latency_ms - b.latency_ms)
              .map(a => <AckBadge key={a.agent_id} ack={a} />)
            }
          </div>
        </div>
      ) : (
        <span className={styles.noAck}>Awaiting acknowledgements…</span>
      )}
    </div>
  );
}

export default function SafetyLog({ safetyEvents, isHalted }) {
  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div className={styles.title}>
          Safety Events
          {isHalted && <span className={styles.haltBadge}>⚠ HALTED</span>}
        </div>
        <span className={styles.total}>{safetyEvents.length} events total</span>
      </div>

      {safetyEvents.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✓</div>
          <div className={styles.emptyTitle}>Mesh is healthy</div>
          <div className={styles.emptyDesc}>No safety events have been recorded.</div>
        </div>
      ) : (
        <div className={styles.list}>
          {safetyEvents.map((e, i) => (
            <EventCard key={e.id} event={e} latest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
