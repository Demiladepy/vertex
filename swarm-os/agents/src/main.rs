mod auction;
mod types;

use std::{env, sync::Arc, time::{SystemTime, UNIX_EPOCH}};

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::post,
    Router,
};
use sha2::{Digest, Sha256};
use tokio::{
    sync::RwLock,
    time::{interval, Duration},
};
use tashi_vertex::{Context, Engine, KeySecret, Message, Peers, Socket};

use types::{AgentState, SafetyHaltRequest, SwarmMessage, TaskBid};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Derive a deterministic 32-byte seed by SHA-256-hashing the agent ID string.
/// This lets every peer re-derive the public key of any peer given only its ID.
fn seed_from_id(id: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(id.as_bytes());
    h.finalize().into()
}

// ── Shared HTTP-server state ──────────────────────────────────────────────────

/// The axum handlers share this with the main task via Arc<RwLock<>>.
struct HttpCtx {
    /// Current live state (writable by main task, readable by HTTP handlers).
    agent_state: RwLock<AgentState>,
    /// Channel to push safety-halt triggers received over HTTP back into
    /// the main loop so they are handled identically to mesh-sourced halts.
    halt_tx: tokio::sync::mpsc::Sender<SafetyHaltRequest>,
}

// ── HTTP handlers (axum) ──────────────────────────────────────────────────────

/// POST /safety — backend calls this for belt-and-suspenders halt injection.
async fn handle_safety_post(
    State(ctx): State<Arc<HttpCtx>>,
    Json(req): Json<SafetyHaltRequest>,
) -> StatusCode {
    eprintln!(
        "[SAFETY-HTTP] halt injected from {} ({})",
        req.source_agent_id, req.fault_type
    );
    let _ = ctx.halt_tx.send(req).await;
    StatusCode::OK
}

/// GET /healthz — quick liveness probe.
async fn healthz() -> StatusCode {
    StatusCode::OK
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Env config ────────────────────────────────────────────────────────────
    let agent_id   = env::var("AGENT_ID").unwrap_or_else(|_| "drone-1".into());
    let agent_type = env::var("AGENT_TYPE").unwrap_or_else(|_| "drone".into());
    let agent_port: u16 = env::var("AGENT_PORT")
        .unwrap_or_else(|_| "9001".into())
        .parse()
        .expect("AGENT_PORT must be a valid u16");
    let http_port: u16 = env::var("AGENT_HTTP_PORT")
        .unwrap_or_else(|_| (agent_port + 1000).to_string())
        .parse()
        .expect("AGENT_HTTP_PORT must be a valid u16");
    let peer_addrs: Vec<String> = env::var("PEER_ADDRS")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    let peer_ids: Vec<String> = env::var("PEER_IDS")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    let backend_url = env::var("BACKEND_URL")
        .unwrap_or_else(|_| "http://backend:3001".into());

    println!(
        "[{}] SwarmOS agent starting  type={}  vertex={}  http={}",
        agent_id, agent_type, agent_port, http_port
    );

    // ── Deterministic keypair ─────────────────────────────────────────────────
    // Each agent derives its secret key from SHA-256(AGENT_ID).  Every peer can
    // reconstruct any other peer's PUBLIC key the same way — no out-of-band
    // key exchange needed for the demo.
    // NOTE: KeySecret::from_bytes is the assumed API; adjust to match the exact
    //       tashi-vertex version if the constructor name differs.
    let seed = seed_from_id(&agent_id);
    let key = KeySecret::from_bytes(&seed)
        .expect("failed to derive KeySecret from seed");
    println!("[{}] Keypair derived (deterministic)", agent_id);

    // ── Peer registry ─────────────────────────────────────────────────────────
    let mut peers = Peers::new()?;
    for (addr, peer_id) in peer_addrs.iter().zip(peer_ids.iter()) {
        let peer_seed = seed_from_id(peer_id);
        let peer_key  = KeySecret::from_bytes(&peer_seed)
            .expect("failed to derive peer key");
        peers.insert(addr, peer_key.public_key(), Default::default())?;
        println!("[{}] Registered peer {} @ {}", agent_id, peer_id, addr);
    }

    // ── Vertex engine ─────────────────────────────────────────────────────────
    let context = Context::new()?;
    let bind_addr = format!("0.0.0.0:{}", agent_port);
    let socket  = Socket::bind(&context, &bind_addr).await?;
    let engine  = Engine::start(&context, socket, Default::default(), &key, peers)?;
    println!("[{}] Vertex engine online on {}", agent_id, bind_addr);

    // ── Initial local state ───────────────────────────────────────────────────
    let initial_state = AgentState {
        id:             agent_id.clone(),
        agent_type:     agent_type.clone(),
        battery:        100.0,
        status:         "idle".into(),
        current_task:   None,
        latency_ms:     0,
        last_bid_score: 0.0,
        http_port,
    };

    // ── Shared state for HTTP server ──────────────────────────────────────────
    let (halt_tx, mut halt_rx) = tokio::sync::mpsc::channel::<SafetyHaltRequest>(16);
    let http_ctx = Arc::new(HttpCtx {
        agent_state: RwLock::new(initial_state.clone()),
        halt_tx,
    });

    // ── Spawn axum HTTP server (belt-and-suspenders safety inlet) ─────────────
    let http_ctx_server = Arc::clone(&http_ctx);
    tokio::spawn(async move {
        let app = Router::new()
            .route("/safety",  post(handle_safety_post))
            .route("/healthz", axum::routing::get(healthz))
            .with_state(http_ctx_server);
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", http_port))
            .await
            .expect("failed to bind HTTP port");
        println!("[{}] HTTP safety-inlet on :{}", agent_id, http_port);
        axum::serve(listener, app).await.expect("HTTP server crashed");
    });

    // ── HTTP client for backend POSTs ─────────────────────────────────────────
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    // ── Local mutable state (owned by main task only) ─────────────────────────
    let mut state = initial_state;
    let mut tick  = interval(Duration::from_secs(2));
    // Skip the first immediate tick so the engine has a moment to settle.
    tick.tick().await;

    println!("[{}] Entering main loop", agent_id);

    // ── Main loop ─────────────────────────────────────────────────────────────
    //
    // Three concurrent arms:
    //   1. 2-second tick  — battery drain + state publish
    //   2. Vertex recv    — process incoming mesh transactions
    //   3. HTTP halt chan  — handle halts injected via HTTP (belt & suspenders)
    loop {
        tokio::select! {
            // ── Arm 1: heartbeat tick ─────────────────────────────────────────
            _ = tick.tick() => {
                // Skip processing if halted.
                if state.status == "halted" {
                    continue;
                }

                // Battery drain
                match state.status.as_str() {
                    "working" => state.battery = (state.battery - 0.1).max(0.0),
                    _         => state.battery = (state.battery - 0.02).max(0.0),
                }

                // Fault condition: battery critically low
                if state.battery < 5.0 && state.status != "fault" {
                    state.status = "fault".into();
                    println!("[{}] FAULT — battery critical ({:.1}%)", state.id, state.battery);
                }

                let tick_ts = now_ms();

                // Broadcast current state to Vertex mesh
                let mesh_msg = SwarmMessage::AgentState(state.clone());
                let tx_bytes = serde_json::to_vec(&mesh_msg).unwrap();
                if let Err(e) = engine.send_transaction(tx_bytes) {
                    eprintln!("[{}] mesh send error: {}", state.id, e);
                }

                // Update latency as round-trip estimate (time since tick start)
                state.latency_ms = now_ms().saturating_sub(tick_ts);

                // Mirror to backend over HTTP (non-blocking — spawn and forget)
                let backend   = backend_url.clone();
                let client    = http_client.clone();
                let state_out = state.clone();
                tokio::spawn(async move {
                    let url = format!("{}/api/agent-state", backend);
                    if let Err(e) = client.post(&url).json(&state_out).send().await {
                        eprintln!("backend POST error: {}", e);
                    }
                });

                // Keep shared state in sync for HTTP handlers
                *http_ctx.agent_state.write().await = state.clone();
            }

            // ── Arm 2: incoming Vertex mesh message ───────────────────────────
            result = engine.recv_message() => {
                let msg = match result {
                    Ok(Message::Event(bytes)) => {
                        match serde_json::from_slice::<SwarmMessage>(&bytes) {
                            Ok(m) => m,
                            Err(e) => {
                                eprintln!("[{}] decode error: {}", state.id, e);
                                continue;
                            }
                        }
                    }
                    Ok(Message::SyncPoint) => continue, // consensus sync, ignore
                    Err(e) => {
                        eprintln!("[{}] recv error: {}", state.id, e);
                        continue;
                    }
                };

                match msg {
                    // ── TASK_POSTED ───────────────────────────────────────────
                    SwarmMessage::TaskPosted { task_id, required_type, posted_at_ms, .. } => {
                        if state.status == "halted" || state.status == "fault" {
                            continue;
                        }
                        let cap = auction::capability_match(
                            &state.agent_type,
                            required_type.as_deref(),
                        );
                        // current load: 0.0 if idle, 0.6 if already working
                        let load = if state.status == "working" { 0.6 } else { 0.0 };
                        match auction::make_bid(
                            &state.id,
                            &task_id,
                            state.battery,
                            load,
                            cap,
                            now_ms(),
                        ) {
                            None => {
                                println!(
                                    "[{}] battery too low ({:.1}%), not bidding on {}",
                                    state.id, state.battery, task_id
                                );
                            }
                            Some(bid) => {
                                println!(
                                    "[{}] bidding on task {} with score {:.3}",
                                    state.id, task_id, bid.score
                                );
                                state.last_bid_score = bid.score;

                                // Broadcast bid to mesh
                                let mesh_msg = SwarmMessage::TaskBid(bid.clone());
                                let _ = engine.send_transaction(
                                    serde_json::to_vec(&mesh_msg).unwrap(),
                                );

                                // Also POST to backend so it can run the
                                // auction and pick a winner
                                let backend = backend_url.clone();
                                let client  = http_client.clone();
                                tokio::spawn(async move {
                                    let _ = client
                                        .post(format!("{}/api/task-bid", backend))
                                        .json(&bid)
                                        .send()
                                        .await;
                                });
                            }
                        }
                    }

                    // ── SAFETY_HALT ───────────────────────────────────────────
                    SwarmMessage::SafetyHalt { source_agent_id, fault_type, detected_at_ms } => {
                        apply_safety_halt(
                            &mut state,
                            &source_agent_id,
                            &fault_type,
                            detected_at_ms,
                            &engine,
                            &http_client,
                            &backend_url,
                        ).await;
                        *http_ctx.agent_state.write().await = state.clone();
                    }

                    // Other message types are informational — no action needed.
                    _ => {}
                }
            }

            // ── Arm 3: safety halt from HTTP (belt & suspenders) ──────────────
            Some(halt_req) = halt_rx.recv() => {
                if state.status != "halted" {
                    apply_safety_halt(
                        &mut state,
                        &halt_req.source_agent_id,
                        &halt_req.fault_type,
                        halt_req.detected_at_ms,
                        &engine,
                        &http_client,
                        &backend_url,
                    ).await;
                    *http_ctx.agent_state.write().await = state.clone();
                }
            }
        }
    }
}

// ── Safety halt helper ────────────────────────────────────────────────────────

async fn apply_safety_halt(
    state:          &mut AgentState,
    source_id:      &str,
    fault_type:     &str,
    detected_at_ms: u64,
    engine:         &Engine,
    http_client:    &reqwest::Client,
    backend_url:    &str,
) {
    let received_at = now_ms();
    let latency     = received_at.saturating_sub(detected_at_ms);

    state.status       = "halted".into();
    state.current_task = None;

    println!(
        "SAFETY HALT received — agent {} halted in {}ms  (source={} fault={})",
        state.id, latency, source_id, fault_type
    );

    // Broadcast ACK on the mesh
    let ack = SwarmMessage::SafetyAck {
        agent_id:            state.id.clone(),
        received_at_ms:      received_at,
        halt_detected_at_ms: detected_at_ms,
    };
    let _ = engine.send_transaction(serde_json::to_vec(&ack).unwrap());

    // Notify backend
    let payload = serde_json::json!({
        "agent_id":        state.id,
        "received_at_ms":  received_at,
        "source_agent_id": source_id,
        "fault_type":      fault_type,
        "detected_at_ms":  detected_at_ms,
    });
    let backend = backend_url.to_string();
    let client  = http_client.clone();
    tokio::spawn(async move {
        let _ = client
            .post(format!("{}/api/safety-ack", backend))
            .json(&payload)
            .send()
            .await;
    });
}
