import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTIES, type Difficulty } from '@cc/shared';
import { Credits } from '../../components/Credits';
import { Logo } from '../../components/Logo';
import { LangToggle } from '../../components/LangToggle';
import { useT } from '../../i18n';
import { ApiError, api, type Boards } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { shake } from '../../lib/shake';
import { useServerEvents } from '../../lib/socket';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import styles from './StartScreen.module.css';

const MAX_NAME = 20;

export function StartScreen() {
  const t = useT();
  const { name, setName, start } = useGame();
  const settings = useSettings((s) => s.settings);
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<Difficulty | null>(null);
  const nameBox = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadBoards = () => api.leaderboard(1).then(setBoards).catch(() => {});
  useEffect(() => {
    loadBoards();
  }, []);
  useServerEvents((e) => {
    if (e.type === 'score:new' || e.type === 'leaderboard:reset') loadBoards();
  });

  async function pick(d: Difficulty) {
    if (loading) return;
    if (!name.trim()) {
      setError(t.nameRequired);
      shake(nameBox.current);
      input.current?.focus();
      return;
    }
    setLoading(d);
    setError(null);
    try {
      await start(d);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      setError(code === 'name_not_allowed' ? t.nameNotAllowed : code === 'network' ? t.errors.network : t.errors.generic);
      shake(nameBox.current);
      setLoading(null);
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Logo />
        <LangToggle />
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>
            <span>{'<'}</span>
            {t.appName}
            <span>{'/>'}</span>
          </h1>
          <p className={styles.tagline}>{t.tagline}</p>
        </div>

        <div ref={nameBox} className={styles.nameWrap}>
          <label htmlFor="player-name">{t.nameLabel}</label>
          <input
            ref={input}
            id="player-name"
            className={styles.name}
            value={name}
            maxLength={MAX_NAME}
            placeholder={t.namePlaceholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          <div className={styles.error}>{error}</div>
        </div>

        <div className={styles.cards}>
          {DIFFICULTIES.map((d, i) => {
            const best = boards?.[d]?.[0];
            return (
              <button
                key={d}
                className={`${styles.card} ${styles[d]}`}
                onClick={() => pick(d)}
                disabled={loading !== null}
                data-loading={loading === d || undefined}
              >
                <div className={styles.cardTop}>
                  <span className={styles.bars} aria-hidden>
                    {[0, 1, 2].map((b) => (
                      <i key={b} className={b <= i ? styles.on : ''} />
                    ))}
                  </span>
                  <span className={styles.count}>{t.questions(settings.questionsPerRun[d])}</span>
                </div>
                <h2>{t.difficulty[d]}</h2>
                <p>{t.difficultyDesc[d]}</p>
                <div className={styles.record}>
                  {best ? (
                    <>
                      <span>🏆 {t.record}</span>
                      <b className="mono">{formatTime(best.totalMs)}</b>
                      <em>{best.name}</em>
                    </>
                  ) : (
                    <span>{t.noRecord}</span>
                  )}
                </div>
                <span className={styles.go}>
                  {t.start}
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      </main>

      <footer className={styles.footer}>
        <Link to="/settings" className={`icon-btn ${styles.gear}`} aria-label={t.settings.title} title={t.settings.title}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        <Credits />
        <span />
      </footer>
    </div>
  );
}
