import { useEffect, useRef, useState } from 'react';
import styles from './AgentGrid.module.css';

const TYPE_COLORS = {
  drone:          '#58a6ff',
  amr:            '#3fb950',
  ground_station: '#e3b341',
  iot_sensor:     '#a371f7',
};

function batteryColor(pct) {
  if (pct > 50) return '#3fb950';
  if (pct > 30) return '#e3b341';
  return '#f85149';
}

function statusClass(status) {
  return styles[status] ?? styles.idle;
}

// ── Single agent card ─────────────────────────────────────────────────────────

function AgentCard({ agent, flashing }) {
  const typeColor = TYPE_COLORS[agent.agent_type] ?? '#8b949e';
  const halted    = agent.status === 'halted';

  return (
    <div
      className={[
        styles.card,
        halted  ? styles.cardHalted : '',
        flashing ? styles.cardFlash  : '',
      ].join(' ')}
    >
      <div className={styles.header}>
        <span className={styles.agentId}>{agent.id}</span>
        <span
          className={styles.typeBadge}
          style={{ color: typeColor, borderColor: typeColor + '66' }}
        >
          {agent.agent_type}
        </span>
      </div>

      <div className={styles.batteryRow}>
        <div className={styles.batteryTrack}>
          <div
            className={styles.batteryFill}
            style={{
              width:      `${Math.max(0, Math.min(100, agent.battery)).toFixed(1)}%`,
              background: batteryColor(agent.battery),
            }}
          />
        </div>
        <span className={styles.batteryLabel}>{agent.battery.toFixed(1)}%</span>
      </div>

      <div className={styles.statusRow}>
        <span className={`${styles.statusPill} ${statusClass(agent.status)}`}>
          {agent.status}
        </span>
        {agent.last_bid_score > 0 && (
          <span className={styles.bidScore}>bid {agent.last_bid_score.toFixed(3)}</span>
        )}
      </div>

      {agent.current_task && (
        <div className={styles.currentTask}>↳ {agent.current_task}</div>
      )}

      <div className={styles.latency}>{agent.latency_ms}ms rtt</div>
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export default function AgentGrid({ agents, lastWinner }) {
  const [flashSet, setFlashSet] = useState(new Set());
  const prevWinnerSeq = useRef(null);

  // Flash winning agent card for 800 ms
  useEffect(() => {
    if (!lastWinner?.winner_id) return;
    if (lastWinner._seq === prevWinnerSeq.current) return;
    prevWinnerSeq.current = lastWinner._seq;

    const id = lastWinner.winner_id;
    setFlashSet(s => new Set([...s, id]));
    setTimeout(() => setFlashSet(s => { const n = new Set(s); n.delete(id); return n; }), 800);
  }, [lastWinner]);

  const agentList = Object.values(agents);

  return (
    <section className={styles.section}>
      <span className={styles.heading}>Agents ({agentList.length})</span>
      {agentList.length === 0
        ? <p className={styles.empty}>No agents connected yet</p>
        : (
          <div className={styles.grid}>
            {agentList.map(a => (
              <AgentCard key={a.id} agent={a} flashing={flashSet.has(a.id)} />
            ))}
          </div>
        )
      }
    </section>
  );
}
