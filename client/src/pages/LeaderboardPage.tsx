import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import QRCode from 'qrcode';
import { DIFFICULTIES, type Difficulty } from '@cc/shared';
import { Logo } from '../components/Logo';
import { useT } from '../i18n';
import { api, type Boards } from '../lib/api';
import { formatTime } from '../lib/format';
import { useServerEvents } from '../lib/socket';
import { useSettings } from '../store/settings';
import styles from './LeaderboardPage.module.css';

const HIGHLIGHT_MS = 12_000;

/** The URL players should open: this server's LAN address when viewed on localhost. */
function usePlayUrl() {
  const [url, setUrl] = useState(location.origin);
  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    api
      .info()
      .then(({ urls }) => {
        if (!urls[0]) return;
        const lan = new URL(urls[0]);
        lan.port = location.port;
        setUrl(lan.origin);
      })
      .catch(() => {});
  }, []);
  return url;
}

export function LeaderboardPage() {
  const t = useT();
  const { rotationSec, showQr } = useSettings((s) => s.settings);
  const [boards, setBoards] = useState<Boards | null>(null);
  const [current, setCurrent] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const playUrl = usePlayUrl();
  const [qr, setQr] = useState('');

  const load = useCallback(() => api.leaderboard(10).then(setBoards).catch(() => {}), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // safety net in case a socket message is missed
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    QRCode.toDataURL(playUrl, { margin: 1, width: 480, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr);
  }, [playUrl]);

  // Rotate between difficulties; `cycle` restarts the timer after a jump.
  useEffect(() => {
    const id = setTimeout(() => setCurrent((c) => (c + 1) % DIFFICULTIES.length), rotationSec * 1000);
    return () => clearTimeout(id);
  }, [current, cycle, rotationSec]);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [highlight]);

  useServerEvents((e) => {
    if (e.type === 'score:new') {
      load();
      setCurrent(DIFFICULTIES.indexOf(e.difficulty));
      setCycle((c) => c + 1);
      setHighlight(e.runId);
    } else if (e.type === 'leaderboard:reset') {
      load();
    }
  });

  const difficulty: Difficulty = DIFFICULTIES[current];
  const entries = boards?.[difficulty] ?? [];

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Logo size="lg" />
        <nav className={styles.tabs}>
          {DIFFICULTIES.map((d, i) => (
            <button
              key={d}
              className={`${styles.tab} ${styles[d]} ${i === current ? styles.active : ''}`}
              onClick={() => {
                setCurrent(i);
                setCycle((c) => c + 1);
              }}
            >
              {t.difficulty[d]}
              {i === current && <i key={`${current}-${cycle}`} style={{ animationDuration: `${rotationSec}s` }} />}
            </button>
          ))}
        </nav>
      </header>

      <main className={`${styles.main} ${showQr ? '' : styles.noQr}`}>
        <section className={`${styles.board} ${styles[difficulty]}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={difficulty}
              className={styles.boardInner}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.boardHead}>
                <h1>{t.difficulty[difficulty]}</h1>
                <span>{t.top}</span>
              </div>

              {entries.length === 0 ? (
                <div className={styles.empty}>{t.empty}</div>
              ) : (
                <ol className={styles.list}>
                  {Array.from({ length: 10 }, (_, i) => entries[i]).map((e, i) => (
                    <motion.li
                      key={e?.id ?? `empty-${i}`}
                      className={`${styles.row} ${i < 3 ? styles[`p${i + 1}`] : ''} ${e && e.id === highlight ? styles.new : ''} ${!e ? styles.blank : ''}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.35 }}
                    >
                      <span className={styles.rank}>{i + 1}</span>
                      <span className={styles.name}>{e?.name ?? '—'}</span>
                      {e && (
                        <span className={styles.chips}>
                          {e.hints > 0 && <em title={t.hintsUsed}>💡 {e.hints}</em>}
                        </span>
                      )}
                      <span className={`${styles.time} mono`}>{e ? formatTime(e.totalMs, 2) : ''}</span>
                    </motion.li>
                  ))}
                </ol>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {showQr && (
          <aside className={styles.side}>
            <h2>{t.playAt}</h2>
            <div className={styles.qr}>{qr && <img src={qr} alt={playUrl} />}</div>
            <p>{t.scan}</p>
            <b className="mono">{playUrl.replace(/^https?:\/\//, '')}</b>
          </aside>
        )}
      </main>
    </div>
  );
}
