import { useEffect, useRef, useState } from 'react';
import styles from './AgentGrid.module.css';

// ── Fixed slot definitions (always render 5 slots) ────────────────────────

const SLOTS = [
  { id: 'drone-1',          type: 'drone',          color: '#60b4ff', label: 'Drone 1' },
  { id: 'drone-2',          type: 'drone',          color: '#60b4ff', label: 'Drone 2' },
  { id: 'amr-1',            type: 'amr',            color: '#22d47a', label: 'AMR 1' },
  { id: 'ground-station-1', type: 'ground_station', color: '#f5a623', label: 'Ground Station' },
  { id: 'iot-sensor-1',     type: 'iot_sensor',     color: '#a78bfa', label: 'IoT Sensor' },
];

function batteryColor(pct) {
  if (pct > 50) return '#22d47a';
  if (pct > 30) return '#f5a623';
  return '#ef4444';
}

// ── Status pill ───────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const cls = {
    idle:    styles.statusIdle,
    working: styles.statusWorking,
    fault:   styles.statusFault,
    halted:  styles.statusHalted,
    offline: styles.statusOffline,
  }[status] ?? styles.statusIdle;

  return (
    <span className={`${styles.statusPill} ${cls}`}>
      <span className={styles.statusDot} />
      {status}
    </span>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────

function AgentCard({ slot, agent, flashing }) {
  const isOnline  = !!agent && agent.status !== 'offline';
  const status    = agent?.status ?? 'offline';
  const typeLabel = slot.type.replace('_', ' ');

  return (
    <div
      className={[
        styles.card,
        !isOnline           ? styles.cardOffline : '',
        status === 'halted' ? styles.cardHalted  : '',
        flashing            ? styles.cardFlash   : '',
      ].filter(Boolean).join(' ')}
      style={{ '--agent-color': slot.color }}
    >
      {/* Colored left border accent */}
      <div className={styles.accentBar} />

      <div className={styles.cardInner}>
        {/* Top row: id + type badge */}
        <div className={styles.topRow}>
          <span className={styles.agentId}>{slot.id}</span>
          <span
            className={styles.typeBadge}
            style={{ color: slot.color, borderColor: slot.color + '33', background: slot.color + '12' }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Status row */}
        <div className={styles.statusRow}>
          <StatusPill status={status} />
          {isOnline && agent.last_bid_score > 0 && (
            <span className={styles.bidScore}>
              bid {agent.last_bid_score.toFixed(3)}
            </span>
          )}
        </div>

        {/* Battery bar */}
        {isOnline && (
          <div className={styles.batteryRow}>
            <div className={styles.batteryTrack}>
              <div
                className={styles.batteryFill}
                style={{
                  width: `${Math.max(0, Math.min(100, agent.battery)).toFixed(1)}%`,
                  background: batteryColor(agent.battery),
                }}
              />
            </div>
            <span className={styles.batteryLabel}>
              {agent.battery.toFixed(0)}%
            </span>
          </div>
        )}

        {/* Current task */}
        {isOnline && agent.current_task && (
          <div className={styles.taskLine}>
            <span className={styles.taskArrow}>↳</span>
            <span className={styles.taskText}>{agent.current_task}</span>
          </div>
        )}

        {/* Latency */}
        {isOnline && (
          <div className={styles.latencyLine}>
            <span className={styles.latencyVal}>{agent.latency_ms}ms</span>
            <span className={styles.latencyLabel}>rtt</span>
          </div>
        )}

        {/* Offline placeholder */}
        {!isOnline && (
          <div className={styles.offlinePlaceholder}>
            Waiting for agent…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────

export default function AgentGrid({ agents, lastWinner }) {
  const [flashSet, setFlashSet] = useState(new Set());
  const prevWinnerSeq = useRef(null);

  useEffect(() => {
    if (!lastWinner?.winner_id) return;
    if (lastWinner._seq === prevWinnerSeq.current) return;
    prevWinnerSeq.current = lastWinner._seq;
    const id = lastWinner.winner_id;
    setFlashSet(s => new Set([...s, id]));
    setTimeout(() => setFlashSet(s => { const n = new Set(s); n.delete(id); return n; }), 900);
  }, [lastWinner]);

  const onlineCount = SLOTS.filter(s => !!agents[s.id] && agents[s.id].status !== 'offline').length;

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <span className={styles.headingLabel}>Agents</span>
        <span className={styles.headingCount}>{onlineCount}/5 online</span>
      </div>
      <div className={styles.grid}>
        {SLOTS.map(slot => (
          <AgentCard
            key={slot.id}
            slot={slot}
            agent={agents[slot.id] ?? null}
            flashing={flashSet.has(slot.id)}
          />
        ))}
      </div>
    </section>
  );
}
