import { useEffect, useRef } from 'react';
import styles from './TaskFeed.module.css';

function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 1000)  return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

function StatusBadge({ status }) {
  const cls = styles[status] ?? styles.open;
  return <span className={`${styles.statusBadge} ${cls}`}>{status}</span>;
}

function BidBar({ bid }) {
  return (
    <div className={styles.bidRow}>
      <span className={styles.bidAgent}>{bid.agent_id}</span>
      <div className={styles.bidBarTrack}>
        <div
          className={styles.bidBarFill}
          style={{ width: `${Math.min(100, bid.score * 100).toFixed(1)}%` }}
          key={`${bid.agent_id}-${bid.score}`}  // re-triggers animation on update
        />
      </div>
      <span className={styles.bidScoreLabel}>{bid.score.toFixed(3)}</span>
    </div>
  );
}

function TaskRow({ task }) {
  return (
    <div className={styles.taskRow}>
      <div className={styles.topLine}>
        <span className={styles.taskDesc}>{task.description}</span>
        <span className={styles.taskAge}>{timeAgo(task.posted_at)}</span>
        <StatusBadge status={task.status} />
      </div>

      <div className={styles.winnerLine}>
        {task.winner_id
          ? <>Winner: <span className={styles.winnerId}>{task.winner_id}</span></>
          : task.bids?.length > 0
          ? <span className={styles.bidding}>bidding… ({task.bids.length})</span>
          : <span style={{ color: 'var(--text-3)' }}>awaiting bids</span>
        }
      </div>

      {task.bids?.length > 0 && (
        <div className={styles.bidBars}>
          {[...task.bids]
            .sort((a, b) => b.score - a.score)
            .map(bid => <BidBar key={bid.agent_id} bid={bid} />)
          }
        </div>
      )}
    </div>
  );
}

export default function TaskFeed({ tasks }) {
  const feedRef = useRef(null);
  const prevLenRef = useRef(0);

  // Auto-scroll to top when a new task arrives (not on bid updates)
  useEffect(() => {
    if (tasks.length > prevLenRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevLenRef.current = tasks.length;
  }, [tasks.length]);

  return (
    <section className={styles.section}>
      <span className={styles.heading}>Task feed ({tasks.length})</span>
      {tasks.length === 0
        ? <p className={styles.empty}>No tasks yet — post one below.</p>
        : (
          <div className={styles.feed} ref={feedRef}>
            {tasks.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        )
      }
    </section>
  );
}
