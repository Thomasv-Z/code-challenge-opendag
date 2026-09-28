import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Logo } from '../../components/Logo';
import { useT } from '../../i18n';
import { formatTime } from '../../lib/format';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import styles from './FinishScreen.module.css';

export function FinishScreen() {
  const t = useT();
  const { result, name, reset, start } = useGame();
  const { settings, setLang } = useSettings();
  const idle = settings.idleResetSec;
  const [left, setLeft] = useState(idle);

  // Hand the kiosk to the next visitor automatically.
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    const bump = () => setLeft(idle);
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => {
      clearInterval(id);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [idle]);

  useEffect(() => {
    if (left <= 0) nextPlayer();
  }, [left]);

  function nextPlayer() {
    setLang(null);
    reset();
  }

  if (!result) return null;
  const podium = result.rank <= 3;

  return (
    <div className={styles.screen}>
      <header>
        <Logo />
      </header>

      <main className={styles.main}>
        {podium && <Confetti />}
        <motion.div
          className={`${styles.card} ${styles[result.difficulty]}`}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles.done}>{t.finished}</span>
          <h1 className={styles.name}>{name}</h1>

          <div className={styles.timeLabel}>{t.yourTime}</div>
          <motion.div
            className={`${styles.time} mono`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            {formatTime(result.totalMs, 2)}
          </motion.div>

          <motion.div
            className={`${styles.rank} ${podium ? styles.podium : ''}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 16 }}
          >
            {podium ? `${['🏆', '🥈', '🥉'][result.rank - 1]} ` : ''}
            {t.rankOn(result.rank, t.difficulty[result.difficulty])}
          </motion.div>

          <div className={styles.stats}>
            <div>
              <span>{t.solveTime}</span>
              <b className="mono">{formatTime(result.rawMs)}</b>
            </div>
            <div>
              <span>{t.hintsUsed}</span>
              <b className="mono">{result.hints}</b>
            </div>
            <div>
              <span>{t.mistakes}</span>
              <b className="mono">{result.wrong}</b>
            </div>
            <div>
              <span>{t.penalty}</span>
              <b className={`mono ${result.penaltyMs ? styles.pen : ''}`}>+{Math.round(result.penaltyMs / 1000)}s</b>
            </div>
          </div>

          <div className={styles.actions}>
            <button className="btn btn-ghost" onClick={() => start(result.difficulty).catch(() => reset(true))}>
              ↻ {t.playAgain}
            </button>
            <button className="btn btn-primary" onClick={nextPlayer}>
              {t.nextPlayer} →
            </button>
          </div>
        </motion.div>

        <div className={styles.idle}>
          <div className={styles.idleBar}>
            <i style={{ width: `${(Math.max(0, left) / idle) * 100}%` }} />
          </div>
          <span>{t.backIn(Math.max(0, left))}</span>
        </div>
      </main>
    </div>
  );
}

const COLORS = ['var(--accent)', 'var(--easy)', 'var(--medium)', 'var(--hard)', 'var(--gold)', '#b06bff'];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 2,
      rotate: Math.random() * 720 - 360,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 8,
    })),
  );
  return (
    <div className={styles.confetti} aria-hidden>
      {pieces.map((p, i) => (
        <motion.i
          key={i}
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.45, background: p.color }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
