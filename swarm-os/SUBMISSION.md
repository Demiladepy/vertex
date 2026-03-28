# SwarmOS — Submission

## Track

**Track 3 — The Agent Economy**

---

## Team and stack

Solo submission.

| Layer | Technology |
|-------|-----------|
| Agent processes | Rust 1.80, Tashi Vertex SDK, tokio, axum, sha2 |
| Bridge / API | Node.js 20, Express 4, ws 8, uuid |
| Dashboard | React 18, Vite 5, plain CSS modules |
| Orchestration | Docker Compose v2 (7 services) |

---

## Pitch

> A leaderless swarm where safety signals, task auctions, and peer consensus
> run entirely on Tashi Vertex — no master, no cloud, no single point of failure.

---

## What makes this different from a standard master-orchestrator approach

**1. No privileged coordinator process.**
In a master-orchestrator system the master is both the bottleneck and the
single point of failure.  If it crashes, the whole fleet stops.  In SwarmOS
every agent runs an identical Vertex engine; any agent can initiate a task
auction or a safety halt.  There is no "leader" to elect because Vertex's DAG
consensus provides agreement without one.  Taking down any single container
leaves the other four running with uninterrupted consensus (quorum = 3).

**2. Safety propagation is a first-class consensus transaction, not a side-channel.**
Master-orchestrator designs typically propagate emergency stops by calling an
API on the master, which then fans out commands.  That adds at least two
network hops and the master's processing time before any agent reacts.
In SwarmOS a `SafetyHalt` transaction is broadcast directly from the detecting
agent to all peers in parallel — one UDP multicast and one axum HTTP POST per
peer — targeting < 100 ms total propagation on LAN.  The Vertex engine
delivers the halt on the consensus-ordered stream alongside auction traffic,
so agents can't miss it by processing a bid simultaneously.

**3. Auction bids are peer-witnessed, not server-mediated.**
Every `TaskBid` transaction appears on the DAG, visible to all peers before
the backend sees it.  In a master system only the master sees bids; collusion
or a compromised master could manipulate winner selection.  Here any agent
can independently audit the same ordered transaction log and verify the
winning bid was the highest score.  The backend is a read-only observer that
relays the agreed result to the dashboard — it cannot alter it.

---

## How Tashi Vertex is used

Vertex provides DAG-based BFT consensus with sub-100 ms finality under normal
network conditions.  In SwarmOS every application message — heartbeat, bid,
halt, ack — is a Vertex *transaction* that enters the DAG before delivery.

**DAG replication:**  when an agent calls `engine.send_transaction(bytes)` the
payload is gossiped to all declared peers and incorporated into a locally
constructed DAG vertex.  A vertex is committed once it is *causally referenced*
by vertices from a BFT quorum of peers (≥ ⌈n/2⌉ + 1).  Committed vertices are
delivered in topological order via `engine.recv_message()`.

**BFT tolerance:**  with five agents the mesh tolerates one Byzantine fault
(up to ⌊(n−1)/3⌋ = 1 faulty node).  In the demo context "Byzantine" means
a crashed or misbehaving container; honest peers continue reaching consensus.

**Sub-100 ms finality:**  the DAG commits in two gossip rounds.  On a 1 Gbps
LAN with five nodes this is measured in tens of milliseconds.  SwarmOS exploits
this for safety propagation: a `SafetyHalt` transaction committed in 40–60 ms
means every peer has a tamper-evident record of the halt within one consensus
round, not just a UDP datagram that could be replayed or dropped.

**Authenticated mesh:**  `Peers::insert(addr, pubkey, opts)` registers each
peer with its public key derived from `SHA-256(AGENT_ID)`.  Vertex's transport
layer verifies message signatures before forwarding; an unknown container
cannot inject transactions into the mesh.

**Why UDP, not TCP:**  Vertex uses UDP to avoid head-of-line blocking.  A slow
consensus round on one topic does not delay delivery of unrelated transactions.
This matters for SwarmOS because a large `AgentState` heartbeat batch should
not delay an urgent `SafetyHalt`.

---

## Demo flow (3-minute script)

| Step | Action | Expected dashboard reaction |
|------|--------|----------------------------|
| **1** | `docker compose up --build` — wait for all containers | "Waiting for agents…" banner appears; five agent cards populate one by one within 15 s; banner disappears on SWARM_READY |
| **2** | Click **Post task** → type "Deliver payload to zone B" → Send | TASK_POSTED event appears in task feed; all five agents' bid bars animate in over 3 s; winner card flashes gold; task status changes to "assigned" |
| **3** | Click **Post task** twice more rapidly | Two concurrent auctions run; MeshTopology edges pulse as bid traffic flows; different winners selected based on real-time battery levels |
| **4** | Click **Inject fault** | "MESH HALTED" red banner fills the header; MeshTopology shows a red ripple propagating from iot-sensor-1 to each peer with 80 ms sequential delays; each edge shows measured ACK latency in ms; all agent status pills turn red "halted" |
| **5** | Click **Recover swarm** | Banner disappears; all agent pills return to "idle"; a new task can be posted immediately |

---

## What we would build next with a grant

**Partition reconciliation metrics dashboard.**
When the mesh splits (e.g. a network partition rather than a crash), the Vertex
DAG forks.  We would instrument the engine's `SyncPoint` deliveries to measure
partition duration, fork depth, and reconciliation latency, then surface those
metrics as a separate panel in the dashboard.  This would demonstrate Vertex's
partition-recovery properties empirically — valuable both as a demo and as a
benchmark harness for the Tashi team.

**Real AMR hardware via the Vertex C SDK.**
The `amr-1` agent is currently a Rust process simulating an autonomous mobile
robot.  With a small bridge layer using the Vertex C SDK we would run the same
auction logic on actual AMR hardware (ROS 2 nav stack on a Clearpath Husky or
similar), with the Rust agent replaced by a C node that reads odometry and
battery telemetry directly from the ROS topic graph.  This closes the
sim-to-real gap and makes SwarmOS a credible industrial reference design.

**Open-source the SwarmOS bridge layer.**
The Node.js backend and React dashboard are generic: they consume any Vertex
agent's heartbeat stream and auction protocol.  We would extract this into a
standalone `@swarm-os/bridge` npm package with a documented plugin API so other
teams building on Tashi Vertex can get a production-quality observability layer
without writing WebSocket infrastructure from scratch.
