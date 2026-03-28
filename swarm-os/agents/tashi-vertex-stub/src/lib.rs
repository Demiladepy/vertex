//! Tashi Vertex SDK stub — functional UDP mesh.
//!
//! Implements the exact public API specified in docs.tashi.network so that
//! `agents/src/main.rs` compiles and runs without the real SDK being published
//! to crates.io yet.  Replace this crate with the real one by changing the
//! `tashi-vertex` dependency in `agents/Cargo.toml` from `path = …` to
//! `version = "…"`.
//!
//! Consensus semantics in the stub
//! ────────────────────────────────
//! The real Vertex engine provides DAG-based BFT consensus before delivering
//! messages.  This stub delivers messages in UDP-arrival order (no ordering
//! guarantee).  All application-level correctness (idempotent state updates,
//! auction winner selection on the backend) is designed to tolerate this.

use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::mpsc;

type BoxError = Box<dyn std::error::Error + Send + Sync + 'static>;

// ── Identity ──────────────────────────────────────────────────────────────────

/// An agent's secret/public keypair derived from a 32-byte seed.
pub struct KeySecret([u8; 32]);

impl KeySecret {
    /// Derive a deterministic keypair from a 32-byte seed.
    ///
    /// The real SDK may use a different constructor name; adjust if needed.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, BoxError> {
        if bytes.len() < 32 {
            return Err("seed must be ≥ 32 bytes".into());
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes[..32]);
        Ok(KeySecret(arr))
    }

    /// Derive the corresponding public key.
    pub fn public_key(&self) -> PublicKey {
        PublicKey(self.0)
    }
}

/// An agent's 32-byte public key, used to authenticate peer connections.
pub struct PublicKey([u8; 32]);

// ── Runtime context ───────────────────────────────────────────────────────────

/// Vertex runtime context — allocates internal resources.
pub struct Context;

impl Context {
    pub fn new() -> Result<Self, BoxError> {
        Ok(Context)
    }
}

// ── Peer registry ─────────────────────────────────────────────────────────────

/// Authenticated peer registry.
///
/// In the real SDK every peer must be declared upfront with its public key so
/// that the engine can verify message authenticity.  The stub records addresses
/// only (keys are ignored) and relies on Docker network isolation for security.
pub struct Peers(Vec<String>);

impl Peers {
    pub fn new() -> Result<Self, BoxError> {
        Ok(Peers(Vec::new()))
    }

    /// Register a peer by address and public key.
    /// `_opts` is the default peer-options struct; pass `Default::default()`.
    pub fn insert(&mut self, addr: &str, _key: PublicKey, _opts: ()) -> Result<(), BoxError> {
        self.0.push(addr.to_string());
        Ok(())
    }
}

// ── UDP transport ─────────────────────────────────────────────────────────────

/// Bound UDP socket that the Engine reads from and writes to.
pub struct Socket(UdpSocket);

impl Socket {
    pub async fn bind(_ctx: &Context, addr: &str) -> Result<Self, BoxError> {
        let s = UdpSocket::bind(addr).await?;
        Ok(Socket(s))
    }
}

// ── Consensus engine ──────────────────────────────────────────────────────────

/// Message delivered by `Engine::recv_message`.
pub enum Message {
    /// An application transaction that has cleared consensus.
    /// The payload is the raw bytes passed to `send_transaction`.
    Event(Vec<u8>),
    /// A consensus checkpoint — no application payload.
    /// The real engine emits these periodically; agents should ignore them.
    SyncPoint,
}

/// The Vertex consensus engine handle.
///
/// `send_transaction` is synchronous (non-blocking): it enqueues the payload
/// and a background tokio task fans the UDP packets out to all peers.
/// `recv_message` is async: it yields the next consensus-ordered delivery.
pub struct Engine {
    socket:  Arc<UdpSocket>,
    send_tx: mpsc::UnboundedSender<Vec<u8>>,
}

impl Engine {
    /// Initialise the consensus engine and start the background sender.
    ///
    /// Must be called from within a tokio runtime (e.g. inside `#[tokio::main]`).
    pub fn start(
        _ctx:   &Context,
        socket: Socket,
        _opts:  (),
        _key:   &KeySecret,
        peers:  Peers,
    ) -> Result<Self, BoxError> {
        let arc_socket = Arc::new(socket.0);
        let (send_tx, mut recv_rx) = mpsc::unbounded_channel::<Vec<u8>>();

        // Background task: drains the outbound channel and fans UDP packets to
        // all peers.  Errors on individual sends are logged and swallowed so a
        // single unreachable peer cannot block the rest of the mesh.
        let sender_socket = Arc::clone(&arc_socket);
        let peer_addrs    = peers.0;
        tokio::spawn(async move {
            while let Some(data) = recv_rx.recv().await {
                for peer in &peer_addrs {
                    if let Err(e) = sender_socket.send_to(&data, peer.as_str()).await {
                        eprintln!("[vertex-stub] UDP send to {} failed: {}", peer, e);
                    }
                }
            }
        });

        Ok(Engine { socket: arc_socket, send_tx })
    }

    /// Broadcast a transaction to all peers.
    ///
    /// Non-blocking.  The real SDK additionally replicates via the DAG and
    /// waits for BFT quorum before the transaction appears in any peer's
    /// `recv_message` stream; the stub delivers immediately via UDP.
    pub fn send_transaction(&self, data: Vec<u8>) -> Result<(), BoxError> {
        self.send_tx
            .send(data)
            .map_err(|e| -> BoxError { e.to_string().into() })
    }

    /// Wait for the next message from the mesh.
    ///
    /// Returns `Message::Event(bytes)` for application payloads.
    /// The real SDK guarantees total ordering of events across the DAG; the
    /// stub delivers in UDP arrival order.
    pub async fn recv_message(&self) -> Result<Message, BoxError> {
        let mut buf = vec![0u8; 65_535];
        let (len, _from) = self.socket.recv_from(&mut buf).await?;
        buf.truncate(len);
        Ok(Message::Event(buf))
    }
}
