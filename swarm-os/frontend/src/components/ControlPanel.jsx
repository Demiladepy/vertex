import { useRef, useState } from 'react';
import styles from './ControlPanel.module.css';

const FAULT_TYPES = [
  { value: 'obstacle_detected', label: 'Obstacle detected' },
  { value: 'sensor_fault',      label: 'Sensor fault' },
  { value: 'comm_loss',         label: 'Comm loss' },
  { value: 'power_critical',    label: 'Power critical' },
  { value: 'collision_risk',    label: 'Collision risk' },
];

const QUICK_TASKS = [
  'Scan sector A for obstacles',
  'Deliver payload to zone 3',
  'Recharge at station 2',
  'Survey perimeter',
  'Calibrate sensors',
];

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export default function ControlPanel({ agents = {}, onAction }) {
  const [desc,        setDesc]        = useState('');
  const [faultType,   setFaultType]   = useState(FAULT_TYPES[0].value);
  const [faultSource, setFaultSource] = useState('');
  const [panel,       setPanel]       = useState(null); // 'task' | 'fault' | null
  const [busy,        setBusy]        = useState(false);
  const [feedback,    setFeedback]    = useState(null);
  const inputRef = useRef(null);

  const agentIds = Object.keys(agents);

  function flash(ok, msg) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 3500);
  }

  function togglePanel(name) {
    setPanel(p => {
      if (p === name) return null;
      if (name === 'task') setTimeout(() => inputRef.current?.focus(), 40);
      if (name === 'fault' && !faultSource && agentIds.length > 0) setFaultSource(agentIds[0]);
      return name;
    });
  }

  async function submitTask(e) {
    e.preventDefault();
    if (!desc.trim()) return;
    setBusy(true);
    try {
      await apiPost('/api/task', { description: desc.trim() });
      onAction?.('success', `Task posted: "${desc.trim().slice(0, 40)}"`);
      setDesc('');
      setPanel(null);
    } catch (err) {
      flash(false, err.message);
    } finally {
      setBusy(false);
    }
  }

  async function injectFault() {
    setBusy(true);
    const src = faultSource || agentIds[0] || 'iot-sensor-1';
    try {
      await apiPost('/api/safety-signal', {
        source_agent_id: src,
        fault_type: faultType,
        detected_at_ms: Date.now(),
      });
      onAction?.('warning', `Safety halt: ${faultType} from ${src}`);
      setPanel(null);
    } catch (err) {
      flash(false, err.message);
    } finally {
      setBusy(false);
    }
  }

  async function recoverSwarm() {
    setBusy(true);
    try {
      await apiPost('/api/recover', {});
      onAction?.('success', 'Swarm recovered');
    } catch (err) {
      flash(false, err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <span className={styles.headingLabel}>Controls</span>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className={styles.btnRow}>
        <button
          className={`${styles.btn} ${styles.btnPost} ${panel === 'task' ? styles.btnActive : ''}`}
          onClick={() => togglePanel('task')}
          disabled={busy}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Post task
        </button>

        <button
          className={`${styles.btn} ${styles.btnFault} ${panel === 'fault' ? styles.btnActive : ''}`}
          onClick={() => togglePanel('fault')}
          disabled={busy}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Inject fault
        </button>

        <button
          className={`${styles.btn} ${styles.btnRecover}`}
          onClick={recoverSwarm}
          disabled={busy}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.5 15a9 9 0 1 1-2.7-7.8L23 10" />
          </svg>
          Recover
        </button>
      </div>

      {/* ── Post task panel ───────────────────────────────────────────────── */}
      {panel === 'task' && (
        <div className={styles.subPanel}>
          <form className={styles.taskForm} onSubmit={submitTask}>
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Describe the task…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              disabled={busy}
              maxLength={120}
            />
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPost}`}
              disabled={busy || !desc.trim()}
            >
              Send
            </button>
          </form>

          <div className={styles.quickList}>
            <span className={styles.quickLabel}>Quick pick</span>
            <div className={styles.quickBtns}>
              {QUICK_TASKS.map(q => (
                <button
                  key={q}
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => { setDesc(q); setTimeout(() => inputRef.current?.focus(), 40); }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Fault injection panel ─────────────────────────────────────────── */}
      {panel === 'fault' && (
        <div className={styles.subPanel}>
          <div className={styles.faultFields}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Fault type</label>
              <select
                className={styles.select}
                value={faultType}
                onChange={e => setFaultType(e.target.value)}
                disabled={busy}
              >
                {FAULT_TYPES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Source agent</label>
              <select
                className={styles.select}
                value={faultSource}
                onChange={e => setFaultSource(e.target.value)}
                disabled={busy || agentIds.length === 0}
              >
                {agentIds.length === 0
                  ? <option value="">No agents online</option>
                  : agentIds.map(id => <option key={id} value={id}>{id}</option>)
                }
              </select>
            </div>
          </div>

          <button
            className={`${styles.btn} ${styles.btnFault} ${styles.btnFull}`}
            onClick={injectFault}
            disabled={busy || agentIds.length === 0}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Inject fault now
          </button>
        </div>
      )}

      {/* ── Feedback ─────────────────────────────────────────────────────── */}
      {feedback && (
        <div className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
