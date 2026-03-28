# SwarmOS

SwarmOS is a leaderless multi-agent coordination platform built on Tashi Vertex BFT consensus.
Five heterogeneous agents — drones, an AMR, a ground station, and an IoT sensor — form a full
P2P mesh where every node is a peer.  There is no master process, no cloud orchestrator, and
no single point of failure.  Task auctions, safety propagation, and heartbeat consensus all
run over the same Vertex DAG; a lightweight Node.js bridge observes the mesh and streams
events to a React dashboard.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Tashi Vertex mesh  (UDP, full-mesh)                │
│                                                                      │
│        drone-1 ──────────────── drone-2                              │
│           │  ╲                 ╱  │                                  │
│           │   ╲               ╱   │                                  │
│           │    amr-1 ─────────    │                                  │
│           │   ╱               ╲   │                                  │
│           │  ╱                 ╲  │                                  │
│        iot-sensor-1 ─── ground-station-1                             │
│                                                                      │
│  Transaction types on the DAG:                                       │
│    AgentState  |  TaskBid  |  SafetyHalt  |  SafetyAck               │
└──────────────────────────┬───────────────────────────────────────────┘
                           │  POST /api/agent-state   (every 2 s)
                           │  POST /api/task-bid      (on TASK_POSTED)
                           │  POST /api/safety-ack    (on halt receipt)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│             backend  (Node.js · Express · ws)   :3001                │
│                                                                      │
│  REST                    WebSocket hub           State store         │
│  POST /api/task    ───►  broadcast TASK_POSTED   agents Map          │
│  POST /api/safety  ───►  broadcast SAFETY_HALT   tasks Array         │
│  POST /api/recover ───►  broadcast SWARM_READY   safetyEvents Array  │
│  GET  /api/snapshot      broadcast METRICS_UPDATE                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │  WebSocket  ws://…:3001/ws
                           │  HTTP GET   /api/snapshot
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│             frontend  (React 18 · Vite)          :5173               │
│                                                                      │
│  MetricsBar │ AgentGrid │ MeshTopology │ TaskFeed │ ControlPanel     │
│                                                                      │
│  useSwarmSocket() — single WebSocket connection, useReducer state    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Quick start

**Prerequisites:** Docker ≥ 24, Docker Compose v2 (`docker compose` command).

```bash
git clone <repo>
cd swarm-os
docker compose up --build
```

Open **http://localhost:5173**.  All five agent cards appear within ~15 seconds.
The "Waiting for agents…" banner disappears once every agent has posted its first
heartbeat (or after the 10-second timeout).

**Local dev (no Docker):**
```bash
# Terminal 1 — backend
cd backend && npm ci && npm run dev

# Terminal 2 — agents (repeat for each AGENT_ID / AGENT_PORT)
cd agents
AGENT_ID=drone-1 AGENT_TYPE=drone AGENT_PORT=9001 \
  PEER_ADDRS=localhost:9002,localhost:9003,localhost:9004,localhost:9005 \
  PEER_IDS=drone-2,amr-1,ground-station-1,iot-sensor-1 \
  BACKEND_URL=http://localhost:3001 \
  cargo run

# Terminal 3 — frontend
cd frontend && npm ci && npm run dev
```

---

## Vertex SDK integration

| Primitive | How SwarmOS uses it |
|-----------|---------------------|
| `Context::new()` | Creates the Vertex runtime.  One context per agent process; owns the I/O reactor and thread pool that drives consensus. |
| `KeySecret::from_bytes(&sha256(AGENT_ID))` | Deterministic identity: every agent derives its keypair from SHA-256 of its string ID.  This means any peer can reconstruct any other peer's public key using only the agent's well-known name — no out-of-band key exchange needed. |
| `Peers::new()` + `peers.insert(addr, pubkey, opts)` | Declares the authenticated peer set.  Vertex will reject traffic from undeclared peers, so the mesh is closed — only the five named agents participate in consensus. |
| `Socket::bind(&context, "0.0.0.0:PORT")` | Binds the UDP transport.  UDP avoids TCP head-of-line blocking; Vertex's consensus layer provides the ordering guarantee that TCP would otherwise handle at the transport layer. |
| `Engine::start(&context, socket, opts, &key, peers)` | Starts the BFT consensus engine.  After this call, every `send_transaction` payload enters the DAG replication protocol before being delivered to any peer's `recv_message`. |
| `engine.send_transaction(bytes)` | Enqueues a transaction for DAG replication.  Used for: periodic `AgentState` heartbeats, `TaskBid` responses, `SafetyHalt` signals, and `SafetyAck` confirmations.  The engine fans the payload to all peers and awaits quorum before delivering. |
| `engine.recv_message().await` → `Message::Event(bytes)` | Delivers the next consensus-ordered application payload.  The `Event` variant carries the raw bytes (JSON-serialised `SwarmMessage`); the `SyncPoint` variant is a consensus checkpoint that agents ignore in the current demo. |

---

## Safety signal design

When any agent detects a fault it takes three simultaneous actions to minimise
propagation latency:

1. **Vertex mesh** — broadcasts a `SafetyHalt` transaction via `send_transaction`.
   Consensus-ordered delivery ensures every peer sees the signal.

2. **HTTP direct** — POSTs to every other agent's `/safety` HTTP inlet
   (axum server on `AGENT_HTTP_PORT`).  This bypasses the DAG entirely and
   arrives in a single RTT.  Belt-and-suspenders: if the mesh is backlogged,
   the HTTP path still halts agents within ~5 ms (LAN RTT).

3. **Backend fan-out** — the detecting agent also POSTs to `/api/safety-signal`.
   The backend immediately broadcasts `SAFETY_HALT` to all WebSocket clients
   and re-POSTs to every registered agent HTTP endpoint.

**Target latency:** < 100 ms from fault detection to all five agents halted.
In practice on a single host the P99 is < 20 ms.

**Priority over auctions:** Once an agent's status is `"halted"` it ignores
all `TaskPosted` messages and refuses to call `make_bid`.  Any in-progress
task simply has no active worker; the backend marks it unassigned.

---

## Auction mechanism

```
bid_score(battery, load, capability_match) =
    (battery / 100.0) × capability_match / (1.0 + load)
```

- **battery** (0–100): agents with more charge win more tasks, incentivising the
  scheduler to keep the swarm balanced.
- **load** (0–1): penalises agents already working (`load = 0.6`) over idle ones
  (`load = 0.0`), preventing pile-on to a single agent.
- **capability_match** (0.5 or 1.0): tasks with a `required_type` penalise
  mismatched agents by half rather than excluding them outright, preserving
  fault-tolerance when the preferred type is unavailable.
- **Battery floor — 15 %:** `make_bid` returns `None` below this threshold.
  An agent with < 15 % battery might not complete the task before its battery
  is exhausted; forcing it to abstain prevents a guaranteed task failure.
- **Tie-breaking:** the backend selects the highest-scoring bid.  Equal scores
  are broken by arrival order (first POST wins), which in practice means the
  lowest-latency agent — a reasonable proxy for mesh proximity.

Auction window is 3 seconds; the backend collects bids, resolves a winner, and
broadcasts `TASK_ASSIGNED`.

---

## Partition resilience

If an agent container dies mid-task:

- **Other agents** continue Vertex consensus among the remaining peers.  The
  DAG remains live as long as quorum holds (≥ ⌈n/2⌉ + 1 nodes; with 5 agents
  that is 3).
- **Backend state** retains the last-known state of the dead agent.  No
  cleanup is performed in the current demo.
- **In-flight task** has no active worker.  The backend's 3-second auction
  window has already closed, so no re-auction is triggered automatically.
  The UI shows the task as `assigned` with no progress — an obvious signal
  to the operator.
- **On restart** the agent resumes posting heartbeats.  Its status is restored
  to `idle`; it can bid on new tasks immediately.  No rejoin handshake is
  needed because Vertex handles peer reconnection at the consensus layer.

---

## Project layout

```
swarm-os/
  agents/                Rust — one binary per agent
    tashi-vertex-stub/   Functional UDP stub (swap for real SDK)
    src/
      main.rs            Vertex engine + axum safety inlet + main loop
      types.rs           AgentState, TaskBid, SafetySignal, SwarmMessage
      auction.rs         bid_score(), make_bid(), capability_match()
  backend/               Node.js + Express + ws
    src/
      index.js           REST endpoints + WebSocket hub + SWARM_READY logic
      state.js           In-memory store (agents, tasks, safety events, metrics)
  frontend/              React 18 + Vite
    src/
      hooks/useSwarmSocket.js   WS hook, useReducer state machine
      components/
        MetricsBar        Uptime / tasks / latency / safety event counters
        AgentGrid         Per-agent cards, battery bars, win-flash animation
        MeshTopology      SVG pentagon, halt-ripple animation, ACK latencies
        TaskFeed          Scrolling task list with animated bid bars
        ControlPanel      Post task / inject fault / recover swarm
  docker-compose.yml     Seven services: backend + 5 agents + frontend
```
