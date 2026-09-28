import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PublicQuestion } from '@cc/shared';
import { CodeBlock } from '../../components/CodeBlock';
import { useLoc, useT } from '../../i18n';
import { formatTime } from '../../lib/format';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { shake } from '../../lib/shake';
import { HintBot } from './HintBot';
import styles from './RunScreen.module.css';

export function RunScreen() {
  const { run, index } = useGame();
  const [confirmQuit, setConfirmQuit] = useState(false);
  if (!run) return null;
  const question = run.questions[index];

  return (
    <div className={styles.screen}>
      <TopBar onQuit={() => setConfirmQuit(true)} />
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          className={styles.stage}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <QuestionView question={question} />
        </motion.div>
      </AnimatePresence>
      <HintBot />
      {confirmQuit && <QuitDialog onCancel={() => setConfirmQuit(false)} />}
    </div>
  );
}

function useNow(interval = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function TopBar({ onQuit }: { onQuit(): void }) {
  const t = useT();
  const { run, index, startedAt, penaltyMs } = useGame();
  const now = useNow();
  const [flashes, setFlashes] = useState<{ id: number; sec: number }[]>([]);
  const prevPenalty = useRef(penaltyMs);

  // Float a "+Xs" badge whenever a penalty is added.
  useEffect(() => {
    const diff = penaltyMs - prevPenalty.current;
    prevPenalty.current = penaltyMs;
    if (diff <= 0) return;
    const id = Date.now();
    setFlashes((f) => [...f, { id, sec: diff / 1000 }]);
    const timer = setTimeout(() => setFlashes((f) => f.filter((x) => x.id !== id)), 1400);
    return () => clearTimeout(timer);
  }, [penaltyMs]);

  if (!run) return null;
  const total = run.questions.length;

  return (
    <header className={styles.top}>
      <div className={styles.meta}>
        <span className={`${styles.diff} ${styles[run.difficulty]}`}>{t.difficulty[run.difficulty]}</span>
        <span className={styles.qof}>{t.questionOf(index + 1, total)}</span>
      </div>

      <div className={styles.progress} aria-hidden>
        {run.questions.map((_, i) => (
          <span key={i} className={i < index ? styles.done : i === index ? styles.current : ''} />
        ))}
      </div>

      <div className={styles.topRight}>
        <div className={styles.timer}>
          <span className="mono">{formatTime(now - startedAt + penaltyMs)}</span>
          {penaltyMs > 0 && (
            <small>
              +{penaltyMs / 1000}s {t.penalty}
            </small>
          )}
          <AnimatePresence>
            {flashes.map((f) => (
              <motion.b
                key={f.id}
                className={styles.flash}
                initial={{ opacity: 0, y: 0, scale: 0.8 }}
                animate={{ opacity: 1, y: 26, scale: 1 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.4 }}
              >
                +{f.sec}s
              </motion.b>
            ))}
          </AnimatePresence>
        </div>
        <button className="icon-btn" onClick={onQuit} aria-label={t.quit} title={t.quit}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </header>
  );
}

/** Renders `inline code` spans in prompts. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

type Status = 'idle' | 'checking' | 'wrong' | 'correct';

function QuestionView({ question }: { question: PublicQuestion }) {
  const t = useT();
  const loc = useLoc();
  const { answer, advance, index, run, notes, setNote } = useGame();
  const showNotes = useSettings((s) => s.settings.showNotes);
  const [status, setStatus] = useState<Status>('idle');
  const [wrongChoices, setWrongChoices] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const answerBox = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(value: string) {
    if (status === 'checking' || status === 'correct' || !value.trim()) return;
    setStatus('checking');
    setPicked(value);
    try {
      const res = await answer(value);
      if (res.correct) {
        setStatus('correct');
        setTimeout(() => advance(res.result), 700);
      } else {
        setStatus('wrong');
        setWrongChoices((w) => [...w, value]);
        shake(answerBox.current);
        input.current?.select();
      }
    } catch {
      setStatus('idle');
    }
  }

  // Number keys 1-4 pick a choice.
  useEffect(() => {
    if (!question.choices) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return; // typing notes
      const i = Number(e.key) - 1;
      const choice = question.choices?.[i];
      if (choice && !wrongChoices.includes(choice)) submit(choice);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div className={styles.question}>
      <div className={`${styles.left} ${showNotes ? styles.withNotes : ''}`}>
        <CodeBlock code={question.code} highlightLine={question.highlightLine} className={styles.code} />
        {showNotes && (
          <label className={styles.notes}>
            <span>
              ✎ {t.notes} <em>{t.questionOf(index + 1, run?.questions.length ?? 0)}</em>
            </span>
            <textarea
              className="mono"
              value={notes[index] ?? ''}
              placeholder={t.notesPlaceholder}
              spellCheck={false}
              onChange={(e) => setNote(index, e.target.value)}
            />
          </label>
        )}
      </div>

      <section className={styles.panel}>
        <span className={`${styles.type} ${styles[question.type]}`}>{t.type[question.type]}</span>
        <h2 className={styles.prompt}>
          <Rich text={loc(question.prompt)} />
        </h2>

        <div ref={answerBox} className={styles.answer}>
          {question.choices ? (
            <div className={styles.choices}>
              {question.choices.map((c, i) => {
                const state =
                  status === 'correct' && picked === c ? styles.correctChoice
                    : wrongChoices.includes(c) ? styles.wrongChoice
                      : status === 'checking' && picked === c ? styles.pending : '';
                return (
                  <button
                    key={c}
                    className={`${styles.choice} ${state}`}
                    disabled={wrongChoices.includes(c) || status === 'correct'}
                    onClick={() => submit(c)}
                  >
                    <kbd>{i + 1}</kbd>
                    <span className="mono">{c}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <form
              className={styles.typed}
              onSubmit={(e) => {
                e.preventDefault();
                submit(typed);
              }}
            >
              <input
                ref={input}
                className={`mono ${status === 'correct' ? styles.correctChoice : status === 'wrong' ? styles.wrongChoice : ''}`}
                value={typed}
                placeholder={t.typeAnswer}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (status === 'wrong') setStatus('idle');
                }}
                disabled={status === 'correct'}
              />
              <button className="btn btn-primary" disabled={!typed.trim() || status === 'checking' || status === 'correct'}>
                {t.submit}
              </button>
            </form>
          )}
        </div>

        <div className={styles.feedback} aria-live="polite">
          {status === 'correct' && <span className={styles.good}>✓ {t.correct}</span>}
          {status === 'wrong' && <span className={styles.bad}>{t.wrong}</span>}
          {status !== 'correct' && status !== 'wrong' && !question.choices && <span className={styles.tip}>{t.typedTip}</span>}
        </div>
      </section>
    </div>
  );
}

function QuitDialog({ onCancel }: { onCancel(): void }) {
  const t = useT();
  const reset = useGame((s) => s.reset);
  return (
    <motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onCancel}>
      <motion.div
        className={styles.dialog}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p>{t.quitConfirm}</p>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>
            ←
          </button>
          <button className="btn btn-danger" onClick={() => reset()}>
            {t.quit}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
