**SwarmOS**: Kinetic Resource ArbitrageA Leaderless P2P Coordination Fabric for Heterogeneous SwarmsBuilt for the Vertex Swarm Challenge 2026SwarmOS is a zero-trust, leaderless multi-agent coordination platform. By leveraging the Tashi Vertex BFT DAG, SwarmOS eliminates the "Master Orchestrator" bottleneck, allowing drones, AMRs, and IoT sensors to negotiate tasks, propagate safety signals, and maintain state consensus in high-latency, cloud-denied environments.

**System Architecture**

**SwarmOS** implements a full P2P mesh where every node is a first-class citizen. There is no single point of failure; if the backend or any single agent drops, the remaining swarm continues to coordinate.

1. The Coordination Layer (Tashi Vertex)Protocol: UDP-based BFT Consensus.Topology: Full-mesh DAG replication.Identity: Deterministic SHA-256 Key Derivation (No out-of-band exchange).
2. The Logic Layer (Rust Edge Agents)Each agent runs a dual-stack architecture:Consensus Engine: Drives the Vertex DAG for global state (Heartbeats, Auctions).Inlet Server (Axum): A high-priority HTTP path for sub-5ms "Belt-and-Suspenders" safety propagation.
3. The Observation Layer (Node.js & React)Passive Observer: The backend does not command; it listens. It streams the DAG state to a real-time dashboard via WebSockets.

The **"Agent Economy"** AuctionSwarmOS treats physical labor as a fluid commodity. Tasks are distributed via a High-Frequency Dutch Auction using a constrained optimization function.$$Score = \frac{(Battery / 100.0) \times CapabilityMatch}{1.0 + Load}$$Lagrange Constraints: Agents automatically abstain from bidding if $Battery < 15\%$, ensuring swarm-wide longevity over individual task completion.Tie-breaking: Resolved by Vertex arrival order, naturally favoring the lowest-latency (closest) node in the mesh.🛡️ Safety & Fault ToleranceIn mission-critical robotics, a "Stop" command cannot wait for a cloud round-trip. SwarmOS uses a Tri-Path Propagation strategy:Vertex DAG: Guarantees every node eventually reaches the "Halted" state consensus.Direct P2P (HTTP): Bypasses the DAG for immediate <20ms execution.Backend Fan-out: Updates the human operator and nearby UI clients instantly.Target Latency: < 100ms across the entire 5-node swarm.Measured P99: < 20ms (Local Mesh).🛠️ Quick StartPrerequisitesDocker ≥ 24.0Docker Compose v2Launch the SwarmBashgit clone <repo-url>

# cd swarm-os
# docker compose up --build
**Dashboard**: http://localhost:5173
**Backend API**: http://localhost:3001

**Project Structure**
DirectoryCore Responsibilityagents/Rust.
Vertex engine, Auction logic (auction.rs), and Safety inlets.backend/Node.js. 

Event streaming and in-memory state snapshotting.frontend/React 18 + Vite. SVG topology visualization and animated task feeds.tashi-vertex-stub/Functional UDP implementation for dev environments.

Vertex SDK IntegrationPrimitiveImplementation DetailContext::new()Owns the I/O reactor and thread pool.Peers::insert()Defines the authenticated set (Closed-mesh security).Socket::bind()Binds the UDP transport to avoid TCP head-of-line blocking.send_transaction()Enqueues heartbeats, bids, and safety signals for DAG replication.

# Participation & Rules

This project is submitted for the Vertex Swarm Challenge 2026.Track: Track 3 | The Agent EconomyFocus: Coordination Depth, Reliability, and Low Latency.
