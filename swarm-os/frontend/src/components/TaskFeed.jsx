import { useEffect, useRef } from 'react';
import styles from './TaskFeed.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 1000)  return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

// ── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    open:       styles.badgeOpen,
    bidding:    styles.badgeBidding,
    assigned:   styles.badgeAssigned,
    completed:  styles.badgeCompleted,
    failed:     styles.badgeFailed,
  };
  return (
    <span className={`${styles.badge} ${map[status] ?? styles.badgeOpen}`}>
      {status}
    </span>
  );
}

// ── Bid bar row ───────────────────────────────────────────────────────────

function BidBar({ bid, rank }) {
  const colors = ['#22d47a', '#60b4ff', '#a78bfa', '#f5a623', '#f04f5a'];
  const color  = colors[rank % colors.length];
  return (
    <div className={styles.bidRow}>
      <span className={styles.bidAgent}>{bid.agent_id.replace('ground-station-', 'gs-')}</span>
      <div className={styles.bidTrack}>
        <div
          className={styles.bidFill}
          key={`${bid.agent_id}-${bid.score}`}
          style={{
            width: `${Math.min(100, bid.score * 100).toFixed(1)}%`,
            background: color,
          }}
        />
      </div>
      <span className={styles.bidScore}>{bid.score.toFixed(3)}</span>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────

function TaskRow({ task }) {
  const sortedBids = task.bids ? [...task.bids].sort((a, b) => b.score - a.score) : [];

  return (
    <div className={`${styles.row} ${task.status === 'assigned' || task.status === 'completed' ? styles.rowDone : ''}`}>
      {/* Header line */}
      <div className={styles.rowHeader}>
        <span className={styles.taskDesc}>{task.description}</span>
        <div className={styles.rowMeta}>
          <span className={styles.taskAge}>{timeAgo(task.posted_at)}</span>
          <StatusBadge status={task.status} />
        </div>
      </div>

      {/* Winner / bidding state */}
      <div className={styles.winnerLine}>
        {task.winner_id ? (
          <span className={styles.winner}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {task.winner_id}
          </span>
        ) : sortedBids.length > 0 ? (
          <span className={styles.biddingTag}>
            <span className={styles.biddingDot} />
            {sortedBids.length} bids
          </span>
        ) : (
          <span className={styles.waitingTag}>awaiting bids</span>
        )}
      </div>

      {/* Bid bars */}
      {sortedBids.length > 0 && (
        <div className={styles.bidBars}>
          {sortedBids.map((bid, i) => (
            <BidBar key={bid.agent_id} bid={bid} rank={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="3" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <span className={styles.emptyTitle}>No tasks yet</span>
      <span className={styles.emptySub}>Post a task below or wait for the auto-seeder</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function TaskFeed({ tasks }) {
  const feedRef    = useRef(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (tasks.length > prevLenRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevLenRef.current = tasks.length;
  }, [tasks.length]);

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <span className={styles.headingLabel}>Task feed</span>
        <span className={styles.headingCount}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>

      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.feed} ref={feedRef}>
          {tasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </section>
  );
}
