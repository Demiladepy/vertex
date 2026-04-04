import styles from './SafetyBanner.module.css';

export default function SafetyBanner({ lastHalt, safetyEvents, onRecover }) {
  const acks = lastHalt?.acks ?? [];

  return (
    <div className={styles.banner}>
      <div className={styles.inner}>
        {/* Left: icon + main message */}
        <div className={styles.left}>
          <div className={styles.icon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className={styles.msg}>
            <span className={styles.label}>SAFETY HALT</span>
            <span className={styles.detail}>
              {lastHalt?.fault_type?.replace(/_/g, ' ') ?? 'unknown fault'}
              {lastHalt?.source_agent_id ? ` · source: ${lastHalt.source_agent_id}` : ''}
            </span>
          </div>
        </div>

        {/* Center: propagation latency chips */}
        {acks.length > 0 && (
          <div className={styles.chips}>
            <span className={styles.chipsLabel}>propagated to</span>
            {acks.map(ack => (
              <span key={ack.agent_id} className={styles.chip}>
                <span className={styles.chipId}>{ack.agent_id.replace('ground-station-', 'gs-')}</span>
                {ack.latency_ms != null && (
                  <span className={styles.chipMs}>{ack.latency_ms}ms</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Right: event count + recover button */}
        <div className={styles.right}>
          <span className={styles.eventCount}>
            {safetyEvents.length} event{safetyEvents.length !== 1 ? 's' : ''}
          </span>
          <button className={styles.recoverBtn} onClick={onRecover}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.5 15a9 9 0 1 1-2.7-7.8L23 10" />
            </svg>
            Recover swarm
          </button>
        </div>
      </div>
    </div>
  );
}
