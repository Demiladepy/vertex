import { useRef, useState } from 'react';
import styles from './ControlPanel.module.css';

async function apiPost(path, body) {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export default function ControlPanel() {
  const [showForm,  setShowForm]  = useState(false);
  const [desc,      setDesc]      = useState('');
  const [busy,      setBusy]      = useState(false);
  const [feedback,  setFeedback]  = useState(null);  // { ok: bool, msg: string }
  const inputRef = useRef(null);

  function flash(ok, msg) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  function openForm() {
    setShowForm(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function submitTask(e) {
    e.preventDefault();
    if (!desc.trim()) return;
    setBusy(true);
    try {
      await apiPost('/api/task', { description: desc.trim() });
      flash(true, `Task posted: "${desc.trim()}"`);
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
    try {
      await apiPost('/api/safety-signal', {
        source_agent_id: 'iot-sensor-1',
        fault_type:      'obstacle_detected',
        detected_at_ms:  Date.now(),
      });
      flash(true, 'Safety halt injected');
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
      flash(true, 'Swarm recovered');
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
          className={`${styles.btn} ${styles.btnPost}`}
          onClick={showForm ? () => setShowForm(false) : openForm}
          disabled={busy}
        >
          {showForm ? '✕ Cancel' : '+ Post task'}
        </button>

        <button
          className={`${styles.btn} ${styles.btnFault}`}
          onClick={injectFault}
          disabled={busy}
        >
          ⚡ Inject fault
        </button>

        <button
          className={`${styles.btn} ${styles.btnRecover}`}
          onClick={recoverSwarm}
          disabled={busy}
        >
          ↺ Recover swarm
        </button>
      </div>

      {showForm && (
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
      )}

      {feedback && (
        <p className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
