import { useEffect, useRef, useState } from 'react';
import styles from './MeshTopology.module.css';

// ── Layout constants ──────────────────────────────────────────────────────────

const W = 300, H = 300;
const CX = 150, CY = 155, R = 108, NODE_R = 26;

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
  drone:          '#60b4ff',
  amr:            '#22d47a',
  ground_station: '#f5a623',
  iot_sensor:     '#a78bfa',
};

// All unique pairs
const ALL_EDGES = [];
for (let i = 0; i < SLOTS.length; i++) {
  for (let j = i + 1; j < SLOTS.length; j++) {
    ALL_EDGES.push([SLOTS[i], SLOTS[j]]);
  }
}

const edgeKey = (a, b) => [a, b].sort().join('|');

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeshTopology({ agents, lastHalt, lastAck, lastActivity }) {
  const [pulsingEdges, setPulsingEdges] = useState(new Set());
  const [haltEdges,    setHaltEdges]    = useState(new Map());
  const [haltSourceId, setHaltSourceId] = useState(null);

  const prevActivityRef = useRef({});
  const pulseTimers     = useRef(new Map());
  const haltTimers      = useRef([]);

  // ── Activity pulse ───────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevActivityRef.current;
    prevActivityRef.current = lastActivity;
    for (const [agentId, ts] of Object.entries(lastActivity)) {
      if (prev[agentId] === ts) continue;
      const edgeKeys = SLOTS.filter(id => id !== agentId).map(id => edgeKey(agentId, id));
      setPulsingEdges(s => new Set([...s, ...edgeKeys]));
      edgeKeys.forEach(key => {
        clearTimeout(pulseTimers.current.get(key));
        pulseTimers.current.set(key, setTimeout(() => {
          setPulsingEdges(s => { const n = new Set(s); n.delete(key); return n; });
        }, 550));
      });
    }
  }, [lastActivity]);

  // ── Halt ripple ──────────────────────────────────────────────────────────
  useEffect(() => {
    haltTimers.current.forEach(clearTimeout);
    haltTimers.current = [];
    if (!lastHalt) { setHaltEdges(new Map()); setHaltSourceId(null); return; }

    const srcId  = lastHalt.source_agent_id;
    const others = SLOTS.filter(id => id !== srcId);
    setHaltEdges(new Map());
    setHaltSourceId(srcId);

    others.forEach((targetId, idx) => {
      const key = edgeKey(srcId, targetId);
      const t   = setTimeout(() => {
        setHaltEdges(prev => new Map(prev).set(key, { latencyMs: null, animKey: Date.now() }));
      }, idx * 80);
      haltTimers.current.push(t);
    });

    const clear = setTimeout(() => setHaltSourceId(null), 1200);
    haltTimers.current.push(clear);
    return () => haltTimers.current.forEach(clearTimeout);
  }, [lastHalt?._seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Latency labels ───────────────────────────────────────────────────────
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
      <div className={styles.heading}>
        <span className={styles.headingLabel}>Mesh topology</span>
        <span className={styles.headingCount}>{SLOTS.length} nodes</span>
      </div>
      <div className={styles.svgWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* ── Edges ─────────────────────────────────────────────────── */}
          {ALL_EDGES.map(([a, b]) => {
            const key      = edgeKey(a, b);
            const posA     = POSITIONS[a];
            const posB     = POSITIONS[b];
            const halt     = haltEdges.get(key);
            const mx       = (posA.x + posB.x) / 2;
            const my       = (posA.y + posB.y) / 2;
            const aOffline = !agents[a] || agents[a]?.status === 'offline';
            const bOffline = !agents[b] || agents[b]?.status === 'offline';
            const isOffline = aOffline || bOffline;

            return (
              <g key={key}>
                <line
                  x1={posA.x} y1={posA.y}
                  x2={posB.x} y2={posB.y}
                  className={[
                    styles.edge,
                    isOffline             ? styles.edgeOffline  : '',
                    pulsingEdges.has(key) ? styles.edgePulsing  : '',
                    halt && !isOffline    ? styles.edgeHalt     : '',
                  ].filter(Boolean).join(' ')}
                  key={halt ? `${key}-${halt.animKey}` : key}
                />
                {halt && !isOffline && halt.latencyMs != null && (
                  <text x={mx} y={my - 5} className={styles.latencyLabel}>
                    {halt.latencyMs}ms
                  </text>
                )}
                {halt && !isOffline && halt.latencyMs == null && (
                  <text x={mx} y={my - 5} className={styles.latencyLabel}>…</text>
                )}
              </g>
            );
          })}

          {/* ── Nodes ─────────────────────────────────────────────────── */}
          {SLOTS.map(slotId => {
            const pos    = POSITIONS[slotId];
            const agent  = agents[slotId];
            const status = agent?.status ?? 'offline';
            const typeColor = TYPE_COLORS[agent?.agent_type] ?? '#3d4f63';

            const fill = status === 'halted'  ? '#ef4444'
                       : status === 'fault'   ? '#f5a623'
                       : status === 'offline' ? '#0f1520'
                       : typeColor;

            const fillOpacity = status === 'offline' ? 1
                              : agent ? 1 : 0.25;

            const isHaltSrc = haltSourceId === slotId;

            // Short label: "D1", "AMR", "GS", "IOT"
            const shortId = slotId.replace('drone-', 'D').replace('amr-', 'AMR').replace('ground-station-', 'GS').replace('iot-sensor-', 'IOT');

            return (
              <g key={slotId} transform={`translate(${pos.x},${pos.y})`}>

                {/* Glow ring for active/online nodes */}
                {agent && status !== 'offline' && status !== 'halted' && (
                  <circle
                    r={NODE_R + 7}
                    fill="none"
                    stroke={typeColor}
                    strokeWidth="1"
                    opacity="0.2"
                  />
                )}

                {/* Halt source ripple */}
                {isHaltSrc && (
                  <circle
                    r={NODE_R}
                    className={styles.sourceRipple}
                    key={`ripple-${lastHalt?._seq}`}
                  />
                )}

                {/* Node body — solid fill, no wireframe dashes */}
                <circle
                  r={NODE_R}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  className={[
                    styles.nodeCircle,
                    status === 'halted'  ? styles.nodeHalted  : '',
                    status === 'fault'   ? styles.nodeFault   : '',
                    status === 'offline' ? styles.nodeOffline : '',
                  ].filter(Boolean).join(' ')}
                />

                {/* Offline: border ring only */}
                {status === 'offline' && (
                  <circle r={NODE_R} fill="none" stroke="#1c2840" strokeWidth="1.5" strokeDasharray="4 3" />
                )}

                {/* Offline X mark */}
                {status === 'offline' && (
                  <g>
                    <line x1={-8} y1={-8} x2={8} y2={8}  stroke="#2f3f55" strokeWidth="2" strokeLinecap="round" />
                    <line x1={8}  y1={-8} x2={-8} y2={8} stroke="#2f3f55" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}

                {/* Status indicator dot (top-right of circle) */}
                {agent && status !== 'offline' && (
                  <circle
                    cx={NODE_R * 0.72}
                    cy={-NODE_R * 0.72}
                    r={4}
                    fill={
                      status === 'halted'  ? '#ef4444'
                      : status === 'fault'  ? '#f5a623'
                      : status === 'working'? '#22d47a'
                      : '#60b4ff'
                    }
                    stroke="#0b0f18"
                    strokeWidth="1.5"
                  />
                )}

                {/* Short ID label */}
                <text y={status === 'offline' ? 4 : -2} className={styles.nodeId}>
                  {shortId}
                </text>

                {/* Agent type sub-label (only when online) */}
                {agent && status !== 'offline' && (
                  <text y={10} className={styles.nodeType}>
                    {agent.agent_type?.replace('_', ' ')}
                  </text>
                )}

                {/* Battery micro-bar */}
                {agent && status !== 'offline' && (
                  <>
                    <rect
                      x={-NODE_R + 2} y={NODE_R + 5}
                      width={(NODE_R - 2) * 2} height={3}
                      rx={1.5}
                      fill="#141c2b"
                    />
                    <rect
                      x={-NODE_R + 2} y={NODE_R + 5}
                      width={Math.max(0, (agent.battery / 100) * ((NODE_R - 2) * 2))} height={3}
                      rx={1.5}
                      fill={
                        agent.battery > 50 ? '#22d47a'
                        : agent.battery > 30 ? '#f5a623' : '#ef4444'
                      }
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
