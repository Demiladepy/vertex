import { useRef, useState } from 'react';
import styles from './ControlPanel.module.css';

const FAULT_TYPES = [
  { value: 'obstacle_detected',  label: 'Obstacle detected' },
  { value: 'sensor_fault',       label: 'Sensor fault' },
  { value: 'comm_loss',          label: 'Comm loss' },
  { value: 'power_critical',     label: 'Power critical' },
  { value: 'collision_risk',     label: 'Collision risk' },
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
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export default function ControlPanel({ agents = {}, onAction }) {
  const [showForm,    setShowForm]    = useState(false);
  const [showFault,   setShowFault]   = useState(false);
  const [desc,        setDesc]        = useState('');
  const [faultType,   setFaultType]   = useState(FAULT_TYPES[0].value);
  const [faultSource, setFaultSource] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [feedback,    setFeedback]    = useState(null);
  const inputRef = useRef(null);

  const agentIds = Object.keys(agents);

  function flash(ok, msg) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 3500);
  }

  function openForm() {
    setShowFault(false);
    setShowForm(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function openFault() {
    setShowForm(false);
    setShowFault(v => !v);
    if (!faultSource && agentIds.length > 0) {
      setFaultSource(agentIds[0]);
    }
  }

  function pickQuick(task) {
    setDesc(task);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function submitTask(e) {
    e.preventDefault();
    if (!desc.trim()) return;
    setBusy(true);
    try {
      await apiPost('/api/task', { description: desc.trim() });
      onAction?.('success', `Task posted: "${desc.trim().slice(0, 40)}"`);
      setDesc('');
      setShowForm(false);
    } catch (err) {
      flash(false, `Error: ${err.message}`);
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
        fault_type:      faultType,
        detected_at_ms:  Date.now(),
      });
      onAction?.('warning', `Safety halt: ${faultType} from ${src}`);
      setShowFault(false);
    } catch (err) {
      flash(false, `Error: ${err.message}`);
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
      flash(false, `Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <span className={styles.heading}>Controls</span>

      <div className={styles.buttonRow}>
        <button
          className={`${styles.btn} ${styles.btnPost} ${showForm ? styles.btnActive : ''}`}
          onClick={showForm ? () => setShowForm(false) : openForm}
          disabled={busy}
        >
          {showForm ? '✕ Cancel' : '+ Post task'}
        </button>

        <button
          className={`${styles.btn} ${styles.btnFault} ${showFault ? styles.btnActive : ''}`}
          onClick={openFault}
          disabled={busy}
        >
          ⚡ Inject fault
        </button>

        <button
          className={`${styles.btn} ${styles.btnRecover}`}
          onClick={recoverSwarm}
          disabled={busy}
        >
          ↺ Recover
        </button>
      </div>

      {/* Task form */}
      {showForm && (
        <div className={styles.formPanel}>
          <form className={styles.form} onSubmit={submitTask}>
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Task description…"
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

          <div className={styles.quickRow}>
            <span className={styles.quickLabel}>Quick:</span>
            {QUICK_TASKS.map(q => (
              <button
                key={q}
                className={styles.quickBtn}
                type="button"
                onClick={() => pickQuick(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fault form */}
      {showFault && (
        <div className={styles.formPanel}>
          <div className={styles.faultRow}>
            <div className={styles.fieldGroup}>
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

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Source agent</label>
              <select
                className={styles.select}
                value={faultSource}
                onChange={e => setFaultSource(e.target.value)}
                disabled={busy || agentIds.length === 0}
              >
                {agentIds.length === 0
                  ? <option value="">No agents</option>
                  : agentIds.map(id => <option key={id} value={id}>{id}</option>)
                }
              </select>
            </div>

            <button
              className={`${styles.btn} ${styles.btnFault}`}
              onClick={injectFault}
              disabled={busy || agentIds.length === 0}
            >
              Inject
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
