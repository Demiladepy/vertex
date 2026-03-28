'use strict';

const express   = require('express');
const http      = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const cors      = require('cors');
const { v4: uuidv4 } = require('uuid');

const state = require('./state');

const PORT           = parseInt(process.env.PORT           ?? '3001', 10);
const EXPECTED_AGENTS = parseInt(process.env.EXPECTED_AGENTS ?? '5',    10);

// ── Swarm-ready tracking ──────────────────────────────────────────────────────
// Broadcast SWARM_READY once every expected agent has posted at least one
// heartbeat, or after a 10-second timeout (whichever comes first).

const firstSeenAgents = new Set();
let   swarmReadyFired = false;

function checkSwarmReady() {
  if (swarmReadyFired) return;
  if (firstSeenAgents.size >= EXPECTED_AGENTS) fireSwarmReady();
}

function fireSwarmReady(partial = false) {
  if (swarmReadyFired) return;
  swarmReadyFired = true;
  const payload = { agents: [...firstSeenAgents], partial, ready_at: Date.now() };
  console.log(
    `[swarm] SWARM_READY${partial ? ' (timeout)' : ''} — ` +
    `${firstSeenAgents.size}/${EXPECTED_AGENTS} agents online`
  );
  broadcastEvent('SWARM_READY', payload);
}

// Belt-and-suspenders: fire after 10 s even if not all agents checked in.
setTimeout(() => fireSwarmReady(firstSeenAgents.size < EXPECTED_AGENTS), 10_000);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Request logger — timestamp + method + path + body summary
app.use((req, _res, next) => {
  const ts      = new Date().toISOString();
  const summary = req.body && Object.keys(req.body).length
    ? Object.entries(req.body)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
        .join(' ')
    : '';
  console.log(`[${ts}] ${req.method} ${req.path}  ${summary}`);
  next();
});

// ── HTTP server + WebSocket hub ───────────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

/** @type {Set<WebSocket>} */
const clients = new Set();

/**
 * Broadcast a typed event to all connected WS clients.
 * @param {string} type
 * @param {object} payload
 */
function broadcastEvent(type, payload) {
  const frame = JSON.stringify({ type, payload, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame);
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected  total=${clients.size}`);

  // Full snapshot on first connect so the dashboard renders immediately.
  const snap = { ...state.getSnapshot(), swarmReady: swarmReadyFired };
  ws.send(JSON.stringify({ type: 'snapshot', payload: snap, ts: Date.now() }));
  // If swarm is already ready (late-joining browser), replay the event.
  if (swarmReadyFired) {
    ws.send(JSON.stringify({
      type: 'SWARM_READY',
      payload: { agents: [...firstSeenAgents], partial: firstSeenAgents.size < EXPECTED_AGENTS },
      ts: Date.now(),
    }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected  total=${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[ws] error:', err.message);
    clients.delete(ws);
  });
});

// ── REST endpoints ────────────────────────────────────────────────────────────

// GET /health — used by Docker healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /api/snapshot — full state for dashboard initial load
app.get('/api/snapshot', (_req, res) => res.json(state.getSnapshot()));

// ── POST /api/agent-state ─────────────────────────────────────────────────────
// Agents call this every 2 s with their current AgentState.
app.post('/api/agent-state', (req, res) => {
  const agentState = req.body;
  if (!agentState?.id) return res.status(400).json({ error: 'id required' });

  state.upsertAgent(agentState);
  firstSeenAgents.add(agentState.id);
  broadcastEvent('AGENT_UPDATE', agentState);
  checkSwarmReady();
  res.json({ ok: true });
});

// ── POST /api/task ────────────────────────────────────────────────────────────
// Dashboard UI creates tasks here.
app.post('/api/task', (req, res) => {
  const { description, required_type } = req.body ?? {};
  if (!description) return res.status(400).json({ error: 'description required' });

  const id   = uuidv4();
  const task = state.createTask(id, description);

  const taskPosted = {
    task_id:       id,
    description,
    required_type: required_type ?? null,
    posted_at_ms:  task.posted_at,
  };

  broadcastEvent('TASK_POSTED', taskPosted);

  // After 3 s collect bids and pick a winner.
  setTimeout(() => resolveAuction(id), 3000);

  res.json({ ok: true, task_id: id });
});

function resolveAuction(taskId) {
  const winner = state.resolveTaskWinner(taskId);
  const task   = state.getTask(taskId);
  if (!task) return;

  if (winner) {
    console.log(`[auction] task ${taskId} → winner=${winner.agent_id} score=${winner.score.toFixed(3)}`);
    broadcastEvent('TASK_ASSIGNED', { task_id: taskId, winner_id: winner.agent_id, score: winner.score });
    broadcastEvent('AGENT_UPDATE', state.getAgent(winner.agent_id));
  } else {
    console.log(`[auction] task ${taskId} → no bids received`);
    broadcastEvent('TASK_ASSIGNED', { task_id: taskId, winner_id: null, score: 0 });
  }
}

// ── POST /api/task-bid ────────────────────────────────────────────────────────
// Agents POST their bids here (in addition to broadcasting on the mesh).
app.post('/api/task-bid', (req, res) => {
  const bid = req.body;
  if (!bid?.task_id || !bid?.agent_id) {
    return res.status(400).json({ error: 'task_id and agent_id required' });
  }
  const task = state.addBidToTask(bid);
  if (!task) return res.status(404).json({ error: 'task not found' });

  broadcastEvent('BID_RECEIVED', { task_id: bid.task_id, agent_id: bid.agent_id, score: bid.score });
  res.json({ ok: true });
});

// ── POST /api/safety-signal ───────────────────────────────────────────────────
// Any agent detecting a fault POSTs here.
// We store it, broadcast SAFETY_HALT to the dashboard, and re-POST to every
// other agent's /safety HTTP endpoint (belt-and-suspenders redundancy).
app.post('/api/safety-signal', async (req, res) => {
  const signal = req.body;
  if (!signal?.source_agent_id) {
    return res.status(400).json({ error: 'source_agent_id required' });
  }

  const event = state.addSafetyEvent(signal);

  // Broadcast halt to dashboard clients immediately.
  broadcastEvent('SAFETY_HALT', signal);

  // Re-POST to all agents except the source (best-effort, fire-and-forget).
  const endpoints = state.getAllAgentEndpoints();
  const haltBody  = JSON.stringify({
    source_agent_id: signal.source_agent_id,
    fault_type:      signal.fault_type,
    detected_at_ms:  signal.detected_at_ms ?? Date.now(),
  });

  for (const [agentId, endpoint] of endpoints) {
    if (agentId === signal.source_agent_id) continue;
    fetch(`${endpoint}/safety`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    haltBody,
    }).catch(err => {
      console.warn(`[safety] could not reach ${agentId} at ${endpoint}: ${err.message}`);
    });
  }

  console.log(`[SAFETY] halt event stored  id=${event.id}  fanning out to ${endpoints.size - 1} agents`);
  res.json({ ok: true, event_id: event.id });
});

// ── POST /api/safety-ack ──────────────────────────────────────────────────────
// Each agent POSTs here after receiving a halt, including its measured latency.
app.post('/api/safety-ack', (req, res) => {
  const ack = req.body;
  if (!ack?.agent_id) return res.status(400).json({ error: 'agent_id required' });

  const event = state.recordSafetyAck(ack);
  if (event) {
    broadcastEvent('SAFETY_ACK', {
      agent_id:        ack.agent_id,
      received_at_ms:  ack.received_at_ms,
      latency_ms:      ack.received_at_ms - event.detected_at_ms,
      event_id:        event.id,
      total_acks:      event.acks.length,
    });
  }
  res.json({ ok: true });
});

// ── POST /api/recover ─────────────────────────────────────────────────────────
// Dashboard calls this to clear all halted/faulted agents.
app.post('/api/recover', (_req, res) => {
  state.recoverAllAgents();
  const agents = state.getAllAgents();
  for (const a of agents) broadcastEvent('AGENT_UPDATE', a);
  broadcastEvent('SWARM_RECOVERED', { recovered_at: Date.now() });
  console.log('[recover] all halted agents set to idle');
  res.json({ ok: true });
});

// ── Metrics broadcast (every 5 s) ─────────────────────────────────────────────

setInterval(() => {
  const m = state.recalcMetrics();
  broadcastEvent('METRICS_UPDATE', m);
}, 5_000);

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[swarm-backend] REST+WS on http://0.0.0.0:${PORT}`);
  console.log(`[swarm-backend] WebSocket hub at ws://0.0.0.0:${PORT}/ws`);
});
