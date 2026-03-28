import { useCallback, useEffect, useReducer, useRef } from 'react';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

// ── State shape ───────────────────────────────────────────────────────────────

const initialState = {
  agents:       {},     // { [id]: AgentState }
  tasks:        [],     // Task[], newest first
  safetyEvents: [],     // SafetyEvent[]
  metrics: {
    uptime_seconds:     0,
    tasks_completed:    0,
    avg_bid_latency_ms: 0,
    safety_events:      0,
    agent_count:        0,
  },
  isConnected:  false,
  swarmReady:   false,
  isHalted:     false,
  lastHalt:     null,   // { source_agent_id, fault_type, _seq } | null
  lastWinner:   null,   // { task_id, winner_id, score } | null
  lastAck:      null,   // { agent_id, latency_ms, ... } | null
  lastActivity: {},     // { [agentId]: timestamp } — updated on every AGENT_UPDATE
};

// ── Normalise tasks from both snapshot shape and event shape ──────────────────

function normTask(t) {
  return {
    id:          t.id ?? t.task_id,
    description: t.description,
    posted_at:   t.posted_at ?? t.posted_at_ms ?? Date.now(),
    status:      t.status ?? 'open',
    bids:        (t.bids ?? []).map(b => ({ agent_id: b.agent_id, score: b.score })),
    winner_id:   t.winner_id ?? null,
  };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

let _haltSeq = 0; // monotonic counter so lastHalt reference always changes

function reducer(state, action) {
  switch (action.type) {

    case 'snapshot': {
      const { agents = [], tasks = [], safetyEvents = [], metrics, swarmReady } = action.payload;
      return {
        ...state,
        agents:       Object.fromEntries(agents.map(a => [a.id, a])),
        tasks:        normTask && [...tasks].reverse().map(normTask),
        safetyEvents,
        metrics:      metrics ?? state.metrics,
        isHalted:     agents.some(a => a.status === 'halted'),
        swarmReady:   swarmReady ?? state.swarmReady,
      };
    }

    case 'SWARM_READY':
      return { ...state, swarmReady: true };

    case 'AGENT_UPDATE':
      return {
        ...state,
        agents:       { ...state.agents, [action.payload.id]: action.payload },
        isHalted:     Object.values({ ...state.agents, [action.payload.id]: action.payload })
                            .some(a => a.status === 'halted'),
        lastActivity: { ...state.lastActivity, [action.payload.id]: Date.now() },
      };

    case 'TASK_POSTED':
      return {
        ...state,
        tasks: [normTask(action.payload), ...state.tasks].slice(0, 50),
      };

    case 'BID_RECEIVED': {
      const tasks = state.tasks.map(t => {
        if (t.id !== action.payload.task_id) return t;
        const bids = [...t.bids];
        const idx  = bids.findIndex(b => b.agent_id === action.payload.agent_id);
        const bid  = { agent_id: action.payload.agent_id, score: action.payload.score };
        if (idx >= 0) bids[idx] = bid; else bids.push(bid);
        return { ...t, bids, status: 'collecting' };
      });
      return { ...state, tasks };
    }

    case 'TASK_ASSIGNED': {
      const tasks = state.tasks.map(t =>
        t.id === action.payload.task_id
          ? { ...t, winner_id: action.payload.winner_id, status: 'assigned' }
          : t
      );
      return { ...state, tasks, lastWinner: { ...action.payload, _seq: Date.now() } };
    }

    case 'SAFETY_HALT': {
      const haltEvent = {
        id:              `halt-${Date.now()}`,
        source_agent_id: action.payload.source_agent_id,
        fault_type:      action.payload.fault_type,
        detected_at_ms:  action.payload.detected_at_ms ?? Date.now(),
        acks:            [],
      };
      return {
        ...state,
        isHalted:     true,
        lastHalt:     { ...action.payload, _seq: ++_haltSeq },
        safetyEvents: [haltEvent, ...state.safetyEvents].slice(0, 20),
      };
    }

    case 'SAFETY_ACK': {
      const safetyEvents = state.safetyEvents.map((e, i) => {
        if (i !== 0) return e;
        const acks = [...(e.acks ?? [])];
        const idx  = acks.findIndex(a => a.agent_id === action.payload.agent_id);
        if (idx >= 0) acks[idx] = action.payload; else acks.push(action.payload);
        return { ...e, acks };
      });
      return { ...state, safetyEvents, lastAck: action.payload };
    }

    case 'SWARM_RECOVERED': {
      const agents = Object.fromEntries(
        Object.entries(state.agents).map(([id, a]) => [
          id,
          (a.status === 'halted' || a.status === 'fault')
            ? { ...a, status: 'idle', current_task: null }
            : a,
        ])
      );
      return { ...state, agents, isHalted: false, lastHalt: null };
    }

    case 'METRICS_UPDATE':
      return { ...state, metrics: action.payload };

    case 'WS_CONNECTED':
      return { ...state, isConnected: true };

    case 'WS_DISCONNECTED':
      return { ...state, isConnected: false };

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSwarmSocket() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const wsRef    = useRef(null);
  const timerRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: 'WS_CONNECTED' });
      clearTimeout(timerRef.current);
    };

    ws.onmessage = ({ data }) => {
      try {
        const { type, payload } = JSON.parse(data);
        dispatch({ type, payload });
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      dispatch({ type: 'WS_DISCONNECTED' });
      timerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    agents:       s.agents,
    tasks:        s.tasks,
    safetyEvents: s.safetyEvents,
    metrics:      s.metrics,
    isConnected:  s.isConnected,
    swarmReady:   s.swarmReady,
    isHalted:     s.isHalted,
    lastHalt:     s.lastHalt,
    lastWinner:   s.lastWinner,
    lastAck:      s.lastAck,
    lastActivity: s.lastActivity,
  };
}
