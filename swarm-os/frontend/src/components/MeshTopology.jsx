import { useEffect, useRef, useState } from 'react';
import styles from './MeshTopology.module.css';

// ── Layout constants ──────────────────────────────────────────────────────────

const CX = 250, CY = 255, R = 168, NODE_R = 30;

// Fixed pentagon slots — clockwise from top
const SLOTS = ['drone-1', 'drone-2', 'amr-1', 'ground-station-1', 'iot-sensor-1'];

const POSITIONS = Object.fromEntries(
  SLOTS.map((id, i) => {
    const angle = Math.PI * (-0.5 + (2 * i) / SLOTS.length);
    return [id, {
      x: Math.round(CX + R * Math.cos(angle)),
      y: Math.round(CY + R * Math.sin(angle)),
    }];
  })
);

const TYPE_COLORS = {
  drone:          '#58a6ff',
  amr:            '#3fb950',
  ground_station: '#e3b341',
  iot_sensor:     '#a371f7',
};

// All unique pairs: C(5,2) = 10 edges
const ALL_EDGES = [];
for (let i = 0; i < SLOTS.length; i++) {
  for (let j = i + 1; j < SLOTS.length; j++) {
    ALL_EDGES.push([SLOTS[i], SLOTS[j]]);
  }
}

const edgeKey = (a, b) => [a, b].sort().join('|');

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeshTopology({ agents, lastHalt, lastAck, lastActivity }) {
  // Set of edge keys currently pulsing from recent message traffic
  const [pulsingEdges, setPulsingEdges] = useState(new Set());
  // Map edgeKey → { latencyMs: number|null, animKey: number }
  const [haltEdges, setHaltEdges] = useState(new Map());
  // Whether to show the source-node ripple circle
  const [haltSourceId, setHaltSourceId] = useState(null);

  const prevActivityRef = useRef({});
  const pulseTimers     = useRef(new Map());
  const haltTimers      = useRef([]);

  // ── Activity pulse: fires when any agent sends a heartbeat ─────────────────
  useEffect(() => {
    const prev = prevActivityRef.current;
    prevActivityRef.current = lastActivity;

    for (const [agentId, ts] of Object.entries(lastActivity)) {
      if (prev[agentId] === ts) continue;

      // Activate all edges touching this agent
      const edgeKeys = SLOTS
        .filter(id => id !== agentId)
        .map(id => edgeKey(agentId, id));

      setPulsingEdges(s => new Set([...s, ...edgeKeys]));

      edgeKeys.forEach(key => {
        clearTimeout(pulseTimers.current.get(key));
        pulseTimers.current.set(key, setTimeout(() => {
          setPulsingEdges(s => { const n = new Set(s); n.delete(key); return n; });
        }, 550));
      });
    }
  }, [lastActivity]);

  // ── Halt ripple: fires on SAFETY_HALT ─────────────────────────────────────
  useEffect(() => {
    haltTimers.current.forEach(clearTimeout);
    haltTimers.current = [];

    if (!lastHalt) {
      setHaltEdges(new Map());
      setHaltSourceId(null);
      return;
    }

    const srcId  = lastHalt.source_agent_id;
    const others = SLOTS.filter(id => id !== srcId);

    setHaltEdges(new Map());
    setHaltSourceId(srcId);

    others.forEach((targetId, idx) => {
      const key   = edgeKey(srcId, targetId);
      const delay = idx * 80;
      const t = setTimeout(() => {
        setHaltEdges(prev => {
          const next = new Map(prev);
          next.set(key, { latencyMs: null, animKey: Date.now() });
          return next;
        });
      }, delay);
      haltTimers.current.push(t);
    });

    // Clear the source ripple circle after its animation finishes
    const clearRipple = setTimeout(() => setHaltSourceId(null), 1200);
    haltTimers.current.push(clearRipple);

    return () => haltTimers.current.forEach(clearTimeout);
  }, [lastHalt?._seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update latency labels when ACKs arrive ─────────────────────────────────
  useEffect(() => {
    if (!lastAck || !lastHalt) return;
    const key = edgeKey(lastHalt.source_agent_id, lastAck.agent_id);
    setHaltEdges(prev => {
      if (!prev.has(key)) return prev;
      return new Map(prev).set(key, { ...prev.get(key), latencyMs: lastAck.latency_ms });
    });
  }, [lastAck]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={styles.section}>
      <span className={styles.heading}>Mesh topology</span>
      <div className={styles.svgWrap}>
        <svg
          viewBox="0 0 500 510"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* ── Edges ─────────────────────────────────────────────────── */}
          {ALL_EDGES.map(([a, b]) => {
            const key  = edgeKey(a, b);
            const posA = POSITIONS[a] ?? { x: CX, y: CY };
            const posB = POSITIONS[b] ?? { x: CX, y: CY };
            const halt = haltEdges.get(key);
            const mx   = (posA.x + posB.x) / 2;
            const my   = (posA.y + posB.y) / 2;

            return (
              <g key={key}>
                <line
                  x1={posA.x} y1={posA.y}
                  x2={posB.x} y2={posB.y}
                  className={[
                    styles.edgeLine,
                    pulsingEdges.has(key) ? styles.edgePulsing : '',
                    halt ? styles.edgeHalt : '',
                  ].join(' ')}
                  // reset animation when halt fires repeatedly
                  key={halt ? `${key}-${halt.animKey}` : key}
                />
                {halt && halt.latencyMs != null && (
                  <text x={mx} y={my - 6} className={styles.latencyLabel}>
                    {halt.latencyMs}ms
                  </text>
                )}
                {halt && halt.latencyMs == null && (
                  <text x={mx} y={my - 6} className={styles.latencyLabel}>…</text>
                )}
              </g>
            );
          })}

          {/* ── Nodes ─────────────────────────────────────────────────── */}
          {SLOTS.map(slotId => {
            const pos    = POSITIONS[slotId];
            const agent  = agents[slotId];
            const status = agent?.status ?? 'offline';
            const fill   = status === 'halted' ? '#f85149'
                         : status === 'fault'  ? '#e3b341'
                         : TYPE_COLORS[agent?.agent_type] ?? '#484f58';
            const isHaltSrc = haltSourceId === slotId;

            return (
              <g key={slotId} transform={`translate(${pos.x},${pos.y})`}>
                {/* Expanding ripple from halt source */}
                {isHaltSrc && (
                  <circle
                    r={NODE_R}
                    className={styles.sourceRipple}
                    key={`ripple-${lastHalt?._seq}`}
                  />
                )}

                {/* Node body */}
                <circle
                  r={NODE_R}
                  fill={fill}
                  fillOpacity={agent ? 1 : 0.25}
                  className={[
                    styles.nodeCircle,
                    status === 'halted' ? styles.nodeHalted : '',
                    status === 'fault'  ? styles.nodeFault  : '',
                  ].join(' ')}
                />

                {/* Agent ID label */}
                <text y={-6} className={styles.nodeId}>
                  {slotId}
                </text>

                {/* Type sub-label */}
                <text y={8} className={styles.nodeType}>
                  {agent?.agent_type ?? 'offline'}
                </text>

                {/* Battery micro-bar below the node */}
                {agent && (
                  <rect
                    x={-NODE_R} y={NODE_R + 5}
                    width={NODE_R * 2} height={4}
                    rx={2}
                    fill="#2d3148"
                  />
                )}
                {agent && (
                  <rect
                    x={-NODE_R} y={NODE_R + 5}
                    width={Math.max(0, (agent.battery / 100) * NODE_R * 2)} height={4}
                    rx={2}
                    fill={
                      agent.battery > 50 ? '#3fb950'
                      : agent.battery > 30 ? '#e3b341' : '#f85149'
                    }
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
