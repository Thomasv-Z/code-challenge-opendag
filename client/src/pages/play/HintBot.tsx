import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLoc, useT } from '../../i18n';
import { useGame } from '../../store/game';
import styles from './HintBot.module.css';

function BotIcon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect x="6" y="10" width="20" height="16" rx="6" fill="currentColor" />
      <circle cx="12.5" cy="18" r="2.2" fill="var(--bot-eye)" />
      <circle cx="19.5" cy="18" r="2.2" fill="var(--bot-eye)" />
      <path d="M16 10V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5" r="2" fill="currentColor" />
      <path d="M4 17v4M28 17v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Types text out character by character, like a chat reply. */
function Typewriter({ text, onDone }: { text: string; onDone?(): void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) {
      onDone?.();
      return;
    }
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 14);
    return () => clearTimeout(id);
  }, [n, text, onDone]);
  return <>{text.slice(0, n)}</>;
}

export function HintBot() {
  const t = useT();
  const loc = useLoc();
  const { run, index, hints, hint } = useGame();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [typing, setTyping] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Close the chat when moving to the next question.
  useEffect(() => {
    setOpen(false);
  }, [index]);

  useEffect(() => {
    panel.current?.scrollTo({ top: panel.current.scrollHeight, behavior: 'smooth' });
  }, [hints.length, thinking]);

  if (!run) return null;
  const penaltySec = run.hintPenaltySec;
  const remaining = run.questions[index].hintCount - hints.length;

  async function ask() {
    if (thinking || typing || remaining <= 0) return;
    setThinking(true);
    try {
      await new Promise((r) => setTimeout(r, 450)); // a short "thinking" beat
      await hint();
      setTyping(true);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className={styles.root}>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.chat}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'bottom right' }}
          >
            <header className={styles.head}>
              <span className={styles.avatar}>
                <BotIcon size={22} />
              </span>
              <div>
                <b>{t.bot.name}</b>
                <small>
                  <i /> {t.bot.status}
                </small>
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </header>

            <div className={styles.messages} ref={panel}>
              <div className={styles.msg}>{t.bot.greeting(index + 1, penaltySec)}</div>
              {hints.map((h, i) => (
                <motion.div key={i} className={styles.msg} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <span className={styles.hintLabel}>
                    Hint {i + 1}/{run.questions[index].hintCount}
                  </span>
                  {i === hints.length - 1 && typing ? <Typewriter text={loc(h).replace(/`/g, "")} onDone={() => setTyping(false)} /> : <RichHint text={loc(h)} />}
                </motion.div>
              ))}
              {thinking && (
                <div className={`${styles.msg} ${styles.dots}`}>
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {remaining <= 0 && !typing && <div className={styles.msg}>{t.bot.none}</div>}
            </div>

            <footer className={styles.foot}>
              <button className="btn btn-primary" onClick={ask} disabled={remaining <= 0 || thinking || typing}>
                💡 {t.bot.ask(penaltySec)}
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <button className={styles.fab} onClick={() => setOpen((o) => !o)} aria-label={t.bot.open} aria-expanded={open}>
        {!open && <span className={styles.bubble}>{t.bot.open}</span>}
        <BotIcon />
        {hints.length > 0 && <span className={styles.badge}>{hints.length}</span>}
      </button>
    </div>
  );
}

function RichHint({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
      )}
    </>
  );
}
