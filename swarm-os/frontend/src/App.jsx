import { useEffect, useRef } from 'react';
import { useSwarmSocket }   from './hooks/useSwarmSocket';
import { useNotifications } from './hooks/useNotifications';
import MetricsBar    from './components/MetricsBar';
import AgentGrid     from './components/AgentGrid';
import MeshTopology  from './components/MeshTopology';
import TaskFeed      from './components/TaskFeed';
import ControlPanel  from './components/ControlPanel';
import SafetyBanner  from './components/SafetyBanner';
import Notifications from './components/Notifications';
import styles from './App.module.css';

export default function App() {
  const {
    agents, tasks, safetyEvents, metrics,
    isConnected, swarmReady, isHalted, lastHalt, lastWinner, lastAck, lastActivity,
  } = useSwarmSocket();

  const { notifications, add: addNotification, dismiss } = useNotifications();

  const agentCount    = Object.keys(agents).length;
  const prevHaltSeq   = useRef(null);
  const prevWinnerSeq = useRef(null);
  const prevConnected = useRef(false);

  useEffect(() => {
    if (isConnected && !prevConnected.current) {
      addNotification('success', 'Connected to SwarmOS backend');
    } else if (!isConnected && prevConnected.current) {
      addNotification('error', 'Disconnected — reconnecting…');
    }
    prevConnected.current = isConnected;
  }, [isConnected, addNotification]);

  useEffect(() => {
    if (!lastHalt) return;
    if (lastHalt._seq === prevHaltSeq.current) return;
    prevHaltSeq.current = lastHalt._seq;
    addNotification('warning', `Safety halt: ${lastHalt.fault_type} · source: ${lastHalt.source_agent_id}`, 6000);
  }, [lastHalt, addNotification]);

  useEffect(() => {
    if (!lastWinner) return;
    if (lastWinner._seq === prevWinnerSeq.current) return;
    prevWinnerSeq.current = lastWinner._seq;
    addNotification('info', `Task assigned → ${lastWinner.winner_id} (score ${lastWinner.score?.toFixed(3) ?? '—'})`);
  }, [lastWinner, addNotification]);

  async function recoverSwarm() {
    try {
      await fetch('/api/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      addNotification('success', 'Swarm recovered');
    } catch (err) {
      addNotification('error', `Recover failed: ${err.message}`);
    }
  }

  return (
    <div className={styles.root}>

      {/* ── Fixed topbar ────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.logo}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L20.66 7v10L12 22 3.34 17V7L12 2z"
                fill="var(--accent)"
                fillOpacity="0.18"
                stroke="var(--accent)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" fill="var(--accent)" />
            </svg>
            <span className={styles.brandName}>SwarmOS</span>
          </div>
          <span className={styles.brandTag}>Tashi Vertex · Agent Economy</span>
        </div>

        <div className={styles.topbarCenter}>
          {isConnected && !swarmReady && (
            <div className={styles.initBadge}>
              <span className={styles.initSpinner} />
              Initialising — {agentCount}/5 agents
            </div>
          )}
        </div>

        <div className={styles.topbarRight}>
          <span className={`${styles.connBadge} ${isConnected ? styles.connLive : styles.connOff}`}>
            <span className={styles.connDot} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </header>

      {/* ── Safety banner (fixed overlay below topbar) ───────────────────────── */}
      {isHalted && (
        <SafetyBanner
          lastHalt={lastHalt}
          safetyEvents={safetyEvents}
          onRecover={recoverSwarm}
        />
      )}

      {/* ── Metrics strip ───────────────────────────────────────────────────── */}
      <MetricsBar metrics={metrics} agentCount={agentCount} isHalted={isHalted} />

      {/* ── 3-column main layout ─────────────────────────────────────────────── */}
      <main className={`${styles.main} ${isHalted ? styles.mainHalted : ''}`}>

        {/* Left: topology + controls */}
        <aside className={styles.leftCol}>
          <MeshTopology
            agents={agents}
            lastHalt={lastHalt}
            lastAck={lastAck}
            lastActivity={lastActivity}
          />
          <ControlPanel agents={agents} onAction={addNotification} />
        </aside>

        {/* Center: agent cards */}
        <section className={styles.centerCol}>
          <AgentGrid agents={agents} lastWinner={lastWinner} />
        </section>

        {/* Right: task feed */}
        <section className={styles.rightCol}>
          <TaskFeed tasks={tasks} />
        </section>

      </main>

      <Notifications notifications={notifications} onDismiss={dismiss} />
    </div>
  );
}
