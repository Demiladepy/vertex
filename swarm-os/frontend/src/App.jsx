import { useSwarmSocket } from './hooks/useSwarmSocket';
import MetricsBar    from './components/MetricsBar';
import AgentGrid     from './components/AgentGrid';
import MeshTopology  from './components/MeshTopology';
import TaskFeed      from './components/TaskFeed';
import ControlPanel  from './components/ControlPanel';
import styles from './App.module.css';

export default function App() {
  const {
    agents, tasks, safetyEvents, metrics,
    isConnected, swarmReady, isHalted, lastHalt, lastWinner, lastAck, lastActivity,
  } = useSwarmSocket();

  const agentCount = Object.keys(agents).length;

  return (
    <div className={styles.root}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>SwarmOS</h1>
          <span className={styles.subtitle}>— Tashi Vertex Agent Economy</span>
          <span className={`${styles.liveDot} ${isConnected ? styles.liveConnected : styles.liveDisconnected}`} />
          <span className={styles.liveLabel}>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </header>

      {/* ── Waiting banner ────────────────────────────────────────────── */}
      {isConnected && !swarmReady && (
        <div className={styles.waitingBanner}>
          <span className={styles.waitingDot} />
          Waiting for agents… {agentCount}/5 online
        </div>
      )}

      {/* ── Halt banner ───────────────────────────────────────────────── */}
      {isHalted && (
        <div className={styles.haltBanner}>
          ⚠ MESH HALTED
          {lastHalt?.fault_type ? ` — ${lastHalt.fault_type}` : ''}
          {lastHalt?.source_agent_id ? `  ·  source: ${lastHalt.source_agent_id}` : ''}
        </div>
      )}

      {/* ── Metrics bar ───────────────────────────────────────────────── */}
      <MetricsBar metrics={metrics} />

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <main className={styles.main}>
        <div className={styles.left}>
          <MeshTopology
            agents={agents}
            lastHalt={lastHalt}
            lastAck={lastAck}
            lastActivity={lastActivity}
          />
          <ControlPanel />
        </div>

        <div className={styles.right}>
          <AgentGrid agents={agents} lastWinner={lastWinner} />
          <TaskFeed tasks={tasks} />
        </div>
      </main>
    </div>
  );
}
