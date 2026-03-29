import { useState } from 'react';
import styles from './TaskHistory.module.css';

const FILTERS = ['all', 'open', 'collecting', 'assigned', 'done'];

function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 1000)    return 'just now';
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function StatusBadge({ status }) {
  return <span className={`${styles.statusBadge} ${styles[status] ?? styles.open}`}>{status}</span>;
}

function BidBar({ bid, best }) {
  const isBest = bid.score === best;
  return (
    <div className={styles.bidRow}>
      <span className={styles.bidAgent}>{bid.agent_id}</span>
      <div className={styles.bidBarTrack}>
        <div
          className={`${styles.bidBarFill} ${isBest ? styles.bidBarBest : ''}`}
          style={{ width: `${Math.min(100, bid.score * 100).toFixed(1)}%` }}
        />
      </div>
      <span className={`${styles.bidScore} ${isBest ? styles.bidScoreBest : ''}`}>{bid.score.toFixed(3)}</span>
    </div>
  );
}

function TaskCard({ task }) {
  const [open, setOpen] = useState(false);
  const sortedBids = [...(task.bids ?? [])].sort((a, b) => b.score - a.score);
  const best = sortedBids[0]?.score ?? 0;

  return (
    <div className={`${styles.card} ${task.status === 'assigned' || task.status === 'done' ? styles.cardDone : ''}`}>
      <div className={styles.cardTop} onClick={() => sortedBids.length > 0 && setOpen(o => !o)}>
        <div className={styles.desc}>{task.description}</div>
        <div className={styles.meta}>
          <span className={styles.age}>{timeAgo(task.posted_at)}</span>
          <StatusBadge status={task.status} />
          {sortedBids.length > 0 && (
            <span className={styles.arrow}>{open ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {task.winner_id ? (
        <div className={styles.winner}>
          Winner: <span className={styles.winnerId}>{task.winner_id}</span>
          {best > 0 && <span className={styles.winScore}> · score {best.toFixed(3)}</span>}
        </div>
      ) : task.bids?.length > 0 ? (
        <div className={styles.bidding}>
          Bidding… <span className={styles.bidCount}>{task.bids.length} bid{task.bids.length !== 1 ? 's' : ''}</span>
        </div>
      ) : (
        <div className={styles.awaiting}>Awaiting bids</div>
      )}

      {open && sortedBids.length > 0 && (
        <div className={styles.bidBars}>
          {sortedBids.map(b => <BidBar key={b.agent_id} bid={b} best={best} />)}
        </div>
      )}
    </div>
  );
}

export default function TaskHistory({ tasks }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = Object.fromEntries(
    FILTERS.map(f => [f, f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length])
  );

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div className={styles.title}>Task History</div>
        <div className={styles.filterRow}>
          {FILTERS.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''} ${f !== 'all' ? styles[`f_${f}`] : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
              {counts[f] > 0 && <span className={styles.filterCnt}>{counts[f]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Search descriptions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className={styles.resultCount}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {tasks.length === 0 ? 'No tasks posted yet.' : 'No tasks match the filter.'}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}
