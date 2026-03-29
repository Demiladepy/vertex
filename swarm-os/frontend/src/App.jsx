import { useEffect, useRef, useState } from 'react';
import { useSwarmSocket }    from './hooks/useSwarmSocket';
import { useNotifications }  from './hooks/useNotifications';
import MetricsBar    from './components/MetricsBar';
import AgentGrid     from './components/AgentGrid';
import MeshTopology  from './components/MeshTopology';
import TaskFeed      from './components/TaskFeed';
import ControlPanel  from './components/ControlPanel';
import NavBar        from './components/NavBar';
import SafetyLog     from './components/SafetyLog';
import TaskHistory   from './components/TaskHistory';
import Notifications from './components/Notifications';
import styles from './App.module.css';

export default function App() {
  const {
    agents, tasks, safetyEvents, metrics,
    isConnected, swarmReady, isHalted, lastHalt, lastWinner, lastAck, lastActivity,
  } = useSwarmSocket();

  const { notifications, add: addNotification, dismiss } = useNotifications();
  const [view, setView] = useState('dashboard');

  const agentCount    = Object.keys(agents).length;
  const prevHaltSeq   = useRef(null);
  const prevWinnerSeq = useRef(null);
  const prevConnected = useRef(false);

  // Toast on connection state change
  useEffect(() => {
    if (isConnected && !prevConnected.current) {
      addNotification('success', 'Connected to SwarmOS backend');
    } else if (!isConnected && prevConnected.current) {
      addNotification('error', 'Disconnected — reconnecting…');
    }
    prevConnected.current = isConnected;
  }, [isConnected, addNotification]);

  // Toast on safety halt
  useEffect(() => {
    if (!lastHalt) return;
    if (lastHalt._seq === prevHaltSeq.current) return;
    prevHaltSeq.current = lastHalt._seq;
    addNotification('warning', `Safety halt: ${lastHalt.fault_type} · source: ${lastHalt.source_agent_id}`, 6000);
  }, [lastHalt, addNotification]);

  // Toast on task assigned
  useEffect(() => {
    if (!lastWinner) return;
    if (lastWinner._seq === prevWinnerSeq.current) return;
    prevWinnerSeq.current = lastWinner._seq;
    addNotification('info', `Task assigned → ${lastWinner.winner_id} (score ${lastWinner.score?.toFixed(3) ?? '—'})`);
  }, [lastWinner, addNotification]);

  return (
    <div className={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.logo}>
            <span className={styles.logoHex}>⬡</span>
            <span className={styles.title}>SwarmOS</span>
          </div>
          <span className={styles.subtitle}>Tashi Vertex Agent Economy</span>
        </div>
        <div className={styles.statusGroup}>
          {isHalted && (
            <span className={styles.haltPill}>⚠ HALTED</span>
          )}
          <span className={`${styles.connDot} ${isConnected ? styles.connOn : styles.connOff}`} />
          <span className={styles.connLabel}>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </header>

      {/* ── Waiting / Halt banners ───────────────────────────────────────────── */}
      {isConnected && !swarmReady && (
        <div className={styles.waitBanner}>
          <span className={styles.waitDot} />
          Initialising swarm mesh — {agentCount}/5 agents online
        </div>
      )}
      {isHalted && (
        <div className={styles.haltBanner}>
          ⚠ MESH HALTED
          {lastHalt?.fault_type      ? ` — ${lastHalt.fault_type}` : ''}
          {lastHalt?.source_agent_id ? `  ·  source: ${lastHalt.source_agent_id}` : ''}
        </div>
      )}

      {/* ── Metrics bar ─────────────────────────────────────────────────────── */}
      <MetricsBar metrics={metrics} agentCount={agentCount} />

      {/* ── Nav tabs ────────────────────────────────────────────────────────── */}
      <NavBar
        view={view}
        onViewChange={setView}
        safetyCount={safetyEvents.length}
        isHalted={isHalted}
        taskCount={tasks.length}
      />

      {/* ── Views ───────────────────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <main className={styles.main}>
          <div className={styles.left}>
            <MeshTopology
              agents={agents}
              lastHalt={lastHalt}
              lastAck={lastAck}
              lastActivity={lastActivity}
            />
            <ControlPanel
              agents={agents}
              onAction={addNotification}
            />
          </div>
          <div className={styles.right}>
            <AgentGrid agents={agents} lastWinner={lastWinner} />
            <TaskFeed tasks={tasks} />
          </div>
        </main>
      )}

      {view === 'tasks' && (
        <div className={styles.viewWrapper}>
          <TaskHistory tasks={tasks} />
        </div>
      )}

      {view === 'safety' && (
        <div className={styles.viewWrapper}>
          <SafetyLog safetyEvents={safetyEvents} isHalted={isHalted} />
        </div>
      )}

      {/* ── Toast notifications ──────────────────────────────────────────────── */}
      <Notifications notifications={notifications} onDismiss={dismiss} />
    </div>
  );
}
