use crate::types::TaskBid;

/// Core scoring formula.
///
/// - `battery`          — current charge 0.0–100.0
/// - `load`             — current workload 0.0–1.0 (0 = free, 1 = fully loaded)
/// - `capability_match` — 1.0 if agent type matches task requirement, else 0.5
///
/// Returns a value in [0.0, 1.0]. Higher = more competitive.
/// Agents with battery ≤ 15 % must not call this — the caller is responsible
/// for the threshold guard so the function stays pure.
pub fn bid_score(battery: f32, load: f32, capability_match: f32) -> f32 {
    (battery / 100.0) * capability_match / (1.0 + load)
}

/// Build a fully-populated TaskBid for the given agent.
///
/// Returns `None` when battery is at or below the 15 % safety threshold —
/// the agent should not participate in the auction.
pub fn make_bid(
    agent_id: &str,
    task_id: &str,
    battery: f32,
    load: f32,
    capability_match: f32,
    timestamp_ms: u64,
) -> Option<TaskBid> {
    if battery <= 15.0 {
        return None;
    }
    let score = bid_score(battery, load, capability_match);
    Some(TaskBid {
        task_id: task_id.to_string(),
        agent_id: agent_id.to_string(),
        score,
        timestamp_ms,
    })
}

/// Infer capability match for this agent type against a task's required type.
/// If the task has no type requirement, every agent is an equal match.
pub fn capability_match(agent_type: &str, required_type: Option<&str>) -> f32 {
    match required_type {
        None => 1.0,
        Some(req) if req == agent_type => 1.0,
        Some(_) => 0.5,
    }
}
