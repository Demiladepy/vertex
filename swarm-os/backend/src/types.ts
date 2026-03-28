export interface AgentState {
  id: string;           // e.g. "drone-1"
  agent_type: string;   // "drone" | "amr" | "ground_station" | "iot_sensor"
  battery: number;      // 0.0 – 100.0
  status: string;       // "idle" | "working" | "fault" | "halted"
  current_task: string | null;
  latency_ms: number;
  last_bid_score: number;
}

export interface TaskBid {
  task_id: string;
  agent_id: string;
  score: number;
  timestamp_ms: number;
}

export interface SafetySignal {
  source_agent_id: string;
  fault_type: string;
  propagated_to: string[];
  detected_at_ms: number;
  propagation_latency_ms: number;
}
