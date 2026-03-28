'use strict';

/**
 * In-memory swarm state store.
 *
 * All writes go through the exported mutators so callers never touch the raw
 * collections directly — this keeps broadcast hooks easy to add later.
 */

// ── Collections ───────────────────────────────────────────────────────────────

/** @type {Map<string, import('./types').AgentState>} */
const agents = new Map();

/** @type {Map<string, Task>} id → Task */
const tasks = new Map();

/** @type {SafetyEvent[]} */
const safetyEvents = [];

/** @type {Map<string, string>} agentId → `http://host:http_port` */
const agentHttpEndpoints = new Map();

const MAX_TASKS         = 50;
const MAX_SAFETY_EVENTS = 20;

// ── Metrics ───────────────────────────────────────────────────────────────────

const metrics = {
  uptime_start:       Date.now(),
  tasks_completed:    0,
  safety_events:      0,
  avg_bid_latency_ms: 0,
  _bid_latencies:     [],   // internal accumulator
};

// ── Agent helpers ─────────────────────────────────────────────────────────────

function upsertAgent(agentState) {
  agents.set(agentState.id, agentState);

  // Register HTTP endpoint for direct safety injection if port is known.
  // Agent reports http_port in its state payload.
  if (agentState.http_port) {
    // Derive host from Docker service name convention (id == service name).
    // Falls back to 'localhost' for local dev.
    const host = process.env.AGENT_NETWORK === 'docker'
      ? agentState.id
      : 'localhost';
    agentHttpEndpoints.set(agentState.id, `http://${host}:${agentState.http_port}`);
  }
}

function getAgent(id) { return agents.get(id) ?? null; }
function getAllAgents() { return Array.from(agents.values()); }
function getAllAgentEndpoints() { return new Map(agentHttpEndpoints); }

/** Set every non-halted agent to idle (used by /api/recover). */
function recoverAllAgents() {
  for (const [id, agent] of agents) {
    if (agent.status === 'halted' || agent.status === 'fault') {
      agents.set(id, { ...agent, status: 'idle', current_task: null });
    }
  }
}

// ── Task helpers ──────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, description: string, posted_at: number,
 *             status: 'open'|'collecting'|'assigned'|'done',
 *             bids: import('./types').TaskBid[], winner_id: string|null }} Task
 */

function createTask(id, description) {
  /** @type {Task} */
  const task = {
    id,
    description,
    posted_at:  Date.now(),
    status:     'open',
    bids:       [],
    winner_id:  null,
  };
  tasks.set(id, task);
  // Trim oldest if over limit
  if (tasks.size > MAX_TASKS) {
    const oldest = tasks.keys().next().value;
    tasks.delete(oldest);
  }
  return task;
}

function getTask(id) { return tasks.get(id) ?? null; }
function getAllTasks() { return Array.from(tasks.values()); }
function getRecentTasks(limit = MAX_TASKS) {
  return Array.from(tasks.values()).slice(-limit);
}

function addBidToTask(bid) {
  const task = tasks.get(bid.task_id);
  if (!task) return null;
  // Deduplicate — one bid per agent per task
  const existing = task.bids.findIndex(b => b.agent_id === bid.agent_id);
  if (existing >= 0) {
    task.bids[existing] = bid;
  } else {
    task.bids.push(bid);
  }
  task.status = 'collecting';

  // Track latency for metrics
  const latency = bid.timestamp_ms - task.posted_at;
  if (latency > 0) {
    metrics._bid_latencies.push(latency);
  }

  return task;
}

/**
 * Pick the highest-scoring bid and assign the task.
 * Returns the winning bid, or null if no bids were received.
 */
function resolveTaskWinner(taskId) {
  const task = tasks.get(taskId);
  if (!task || task.bids.length === 0) return null;

  const winner = task.bids.reduce((best, b) => (b.score > best.score ? b : best));
  task.winner_id = winner.agent_id;
  task.status    = 'assigned';

  // Mark winning agent as working
  const agent = agents.get(winner.agent_id);
  if (agent) {
    agents.set(winner.agent_id, {
      ...agent,
      status:       'working',
      current_task: taskId,
    });
  }

  metrics.tasks_completed++;
  return winner;
}

function markTaskDone(taskId) {
  const task = tasks.get(taskId);
  if (task) task.status = 'done';
}

// ── Safety helpers ────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, source_agent_id: string, fault_type: string,
 *             detected_at_ms: number, acks: AckRecord[] }} SafetyEvent
 * @typedef {{ agent_id: string, received_at_ms: number, latency_ms: number }} AckRecord
 */

function addSafetyEvent(signal) {
  /** @type {SafetyEvent} */
  const event = {
    id:              `se-${Date.now()}`,
    source_agent_id: signal.source_agent_id,
    fault_type:      signal.fault_type,
    detected_at_ms:  signal.detected_at_ms ?? Date.now(),
    acks:            [],
  };
  safetyEvents.push(event);
  if (safetyEvents.length > MAX_SAFETY_EVENTS) safetyEvents.shift();
  metrics.safety_events++;
  return event;
}

/**
 * Record an ACK from an individual agent. Returns the updated SafetyEvent.
 */
function recordSafetyAck(ack) {
  // Attach to the most recent safety event (or match on detected_at_ms).
  const event = safetyEvents
    .slice()
    .reverse()
    .find(e => e.source_agent_id === ack.source_agent_id ||
               Math.abs(e.detected_at_ms - (ack.detected_at_ms ?? 0)) < 5000);
  if (!event) return null;

  const latency = ack.received_at_ms - event.detected_at_ms;
  event.acks.push({
    agent_id:       ack.agent_id,
    received_at_ms: ack.received_at_ms,
    latency_ms:     Math.max(0, latency),
  });
  return event;
}

function getRecentSafetyEvents(limit = MAX_SAFETY_EVENTS) {
  return safetyEvents.slice(-limit);
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function recalcMetrics() {
  if (metrics._bid_latencies.length > 0) {
    const sum = metrics._bid_latencies.reduce((a, b) => a + b, 0);
    metrics.avg_bid_latency_ms = Math.round(sum / metrics._bid_latencies.length);
  }
  return {
    uptime_seconds:     Math.floor((Date.now() - metrics.uptime_start) / 1000),
    tasks_completed:    metrics.tasks_completed,
    safety_events:      metrics.safety_events,
    avg_bid_latency_ms: metrics.avg_bid_latency_ms,
    agent_count:        agents.size,
  };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function getSnapshot() {
  return {
    agents:       getAllAgents(),
    tasks:        getRecentTasks(),
    safetyEvents: getRecentSafetyEvents(),
    metrics:      recalcMetrics(),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Agents
  upsertAgent,
  getAgent,
  getAllAgents,
  getAllAgentEndpoints,
  recoverAllAgents,
  // Tasks
  createTask,
  getTask,
  getAllTasks,
  getRecentTasks,
  addBidToTask,
  resolveTaskWinner,
  markTaskDone,
  // Safety
  addSafetyEvent,
  recordSafetyAck,
  getRecentSafetyEvents,
  // Metrics
  recalcMetrics,
  // Snapshot
  getSnapshot,
};
