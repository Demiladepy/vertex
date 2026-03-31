/**
 * SwarmOS shared type contract.
 *
 * Single source of truth for every message that crosses any boundary.
 * The Rust equivalents live in agents/src/types.rs — keep them in sync.
 */

export type AgentType = 'drone' | 'amr' | 'ground_station' | 'iot_sensor';
export type AgentStatus = 'idle' | 'working' | 'fault' | 'halted' | 'offline';

export interface AgentState {
  id: string;               // e.g. "drone-1"
  agent_type: AgentType;
  battery: number;          // 0.0 – 100.0, drains in real time
  status: AgentStatus;
  current_task: string | null;
  last_bid_score: number;
  latency_ms: number;       // last measured mesh latency (ms)
  http_port: number;        // agent HTTP safety-inlet port
  lastSeenMs: number;       // unix ms — stamped by backend on receipt
}

export interface Task {
  id: string;
  description: string;
  posted_at: number;        // unix ms
  status: 'open' | 'collecting' | 'assigned' | 'done';
  bids: Bid[];
  winner_id: string | null;
}

export interface Bid {
  agent_id: string;
  task_id: string;
  score: number;            // (battery/100 * capabilityMatch) / (1 + load) ∈ [0,1]
  timestamp_ms: number;
}

export interface SafetyEvent {
  id: string;               // "se-{timestamp}"
  source_agent_id: string;
  fault_type: FaultType;
  detected_at_ms: number;
  acks: AckRecord[];
}

export type FaultType =
  | 'obstacle_detected'
  | 'battery_critical'
  | 'mechanical_fault'
  | 'manual_halt'
  | 'sensor_fault'
  | 'comm_loss'
  | 'power_critical'
  | 'collision_risk';

export interface AckRecord {
  agent_id: string;
  received_at_ms: number;
  latency_ms: number;
}

export interface SwarmMetrics {
  uptime_seconds: number;
  tasks_completed: number;
  avg_bid_latency_ms: number;
  safety_events: number;
  agent_count: number;
}

export interface SwarmSnapshot {
  agents: AgentState[];
  tasks: Task[];
  safetyEvents: SafetyEvent[];
  metrics: SwarmMetrics;
  swarmReady: boolean;
}

// ── WebSocket event envelope ──────────────────────────────────────────────────
// Every WS message uses this shape: { type, payload, ts }

export type WSEventType =
  | 'snapshot'
  | 'SWARM_READY'
  | 'AGENT_UPDATE'
  | 'AGENT_OFFLINE'
  | 'TASK_POSTED'
  | 'BID_RECEIVED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'SAFETY_HALT'
  | 'SAFETY_ACK'
  | 'SWARM_RECOVERED'
  | 'METRICS_UPDATE';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  ts: number;               // unix ms — server-stamped
}

// ── Payload shapes per event type ─────────────────────────────────────────────

export type WSPayloadMap = {
  snapshot:        SwarmSnapshot;
  SWARM_READY:     { agents: string[]; partial: boolean; ready_at: number };
  AGENT_UPDATE:    AgentState;
  AGENT_OFFLINE:   { agentId: string };
  TASK_POSTED:     { task_id: string; description: string; required_type: string | null; posted_at_ms: number };
  BID_RECEIVED:    { task_id: string; agent_id: string; score: number };
  TASK_ASSIGNED:   { task_id: string; winner_id: string | null; score: number };
  TASK_COMPLETED:  { task_id: string };
  SAFETY_HALT:     { source_agent_id: string; fault_type: FaultType; detected_at_ms: number };
  SAFETY_ACK:      { agent_id: string; latency_ms: number; event_id: string; total_acks: number };
  SWARM_RECOVERED: { recovered_at: number };
  METRICS_UPDATE:  SwarmMetrics;
};
