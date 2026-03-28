use serde::{Deserialize, Serialize};

// ── Core domain types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub id: String,           // e.g. "drone-1"
    pub agent_type: String,   // "drone" | "amr" | "ground_station" | "iot_sensor"
    pub battery: f32,         // 0.0 – 100.0
    pub status: String,       // "idle" | "working" | "fault" | "halted"
    pub current_task: Option<String>,
    pub latency_ms: u64,
    pub last_bid_score: f32,
    /// HTTP port this agent listens on for direct safety injection.
    pub http_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBid {
    pub task_id: String,
    pub agent_id: String,
    pub score: f32,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetySignal {
    pub source_agent_id: String,
    pub fault_type: String,
    pub propagated_to: Vec<String>,
    pub detected_at_ms: u64,
    pub propagation_latency_ms: u64,
}

// ── Mesh message envelope ─────────────────────────────────────────────────────
//
// Every transaction on the Vertex mesh is JSON-encoded as one of these variants.
// The `msg_type` tag is used for routing on receipt.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "msg_type", content = "payload")]
pub enum SwarmMessage {
    /// Periodic heartbeat — every agent publishes this every 2 s.
    AgentState(AgentState),

    /// Backend broadcasts this when a new task is available for bidding.
    TaskPosted {
        task_id: String,
        description: String,
        required_type: Option<String>, // if Some, only matching agent_type should bid
        posted_at_ms: u64,
    },

    /// Agent response to a TaskPosted.
    TaskBid(TaskBid),

    /// Emergency halt injected by any agent detecting a safety condition.
    SafetyHalt {
        source_agent_id: String,
        fault_type: String,
        detected_at_ms: u64,
    },

    /// Each agent confirms receipt of a SafetyHalt.
    SafetyAck {
        agent_id: String,
        received_at_ms: u64,
        halt_detected_at_ms: u64,
    },
}

// ── HTTP safety-inject payload (received on /safety) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyHaltRequest {
    pub source_agent_id: String,
    pub fault_type: String,
    pub detected_at_ms: u64,
}
