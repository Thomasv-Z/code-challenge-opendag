import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DIFFICULTIES, QUESTION_MODES, QUESTION_TYPES, type Difficulty, type Settings } from '@cc/shared';
import { Credits } from '../components/Credits';
import { Logo } from '../components/Logo';
import { LangToggle } from '../components/LangToggle';
import { useT } from '../i18n';
import { ApiError, api } from '../lib/api';
import { BASE_PATH } from '../lib/config';
import { shake } from '../lib/shake';
import { useSettings } from '../store/settings';
import styles from './SettingsPage.module.css';

const PIN_KEY = 'cc-admin-pin';
const storage = {
  get: () => {
    try {
      return sessionStorage.getItem(PIN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      sessionStorage.setItem(PIN_KEY, v);
    } catch {
      /* private mode: just ask again next time */
    }
  },
};

export function SettingsPage() {
  const [pin, setPin] = useState<string | null>(null);

  useEffect(() => {
    const saved = storage.get();
    if (saved) api.admin.login(saved).then(() => setPin(saved), () => {});
  }, []);

  return pin ? <Editor pin={pin} /> : <PinGate onUnlock={setPin} />;
}

function PinGate({ onUnlock }: { onUnlock(pin: string): void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.admin.login(value);
      storage.set(value);
      onUnlock(value);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t.settings.wrongPin : t.errors.network);
      shake(form.current);
      setValue('');
    }
  }

  return (
    <div className={styles.gate}>
      <form ref={form} className={styles.gateCard} onSubmit={submit}>
        <Logo />
        <h1>{t.settings.title}</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder={t.settings.pin}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className={styles.error}>{error}</div>
        <button className="btn btn-primary" disabled={!value}>
          {t.settings.unlock}
        </button>
        <Link to="/" className={styles.backLink}>
          ← {t.settings.back}
        </Link>
      </form>
    </div>
  );
}

function Editor({ pin }: { pin: string }) {
  const t = useT();
  const { settings, apply } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));
  const patchDiff = <K extends 'questionsPerRun' | 'enabledTypes' | 'questionMode'>(key: K, d: Difficulty, v: Settings[K][Difficulty]) =>
    setDraft((s) => ({ ...s, [key]: { ...s[key], [d]: v } }));

  async function save() {
    setSaving(true);
    try {
      apply(await api.admin.saveSettings(pin, draft));
      flash(t.settings.saved);
    } catch {
      flash(t.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  async function reset(d?: Difficulty) {
    const what = d ? t.difficulty[d] : t.settings.everything;
    if (!window.confirm(t.settings.resetConfirm(what))) return;
    try {
      await api.admin.reset(pin, d);
      flash('✓');
    } catch {
      flash(t.errors.generic);
    }
  }

  async function exportCsv() {
    const csv = await api.admin.exportCsv(pin);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Logo />
          <span className={styles.divider} />
          <h1>{t.settings.title}</h1>
        </div>
        <div className={styles.actions}>
          <LangToggle />
          <Link to="/" className="btn btn-ghost">
            ← {t.settings.back}
          </Link>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            {t.settings.save}
          </button>
        </div>
      </header>

      <main className={styles.grid}>
        <Card title={t.settings.general}>
          <Field label={t.settings.language}>
            <Segmented value={draft.language} options={[['nl', 'Nederlands'], ['en', 'English']]} onChange={(v) => patch({ language: v })} />
          </Field>
          <Field label={t.settings.theme}>
            <Segmented value={draft.theme} options={[['dark', t.settings.dark], ['light', t.settings.light]]} onChange={(v) => patch({ theme: v })} />
          </Field>
          <Field label={t.settings.idleReset}>
            <Stepper value={draft.idleResetSec} min={10} max={600} step={5} onChange={(v) => patch({ idleResetSec: v })} />
          </Field>
          <Field label={t.settings.showNotes}>
            <Segmented
              value={draft.showNotes ? 'on' : 'off'}
              options={[['on', t.settings.on], ['off', t.settings.off]]}
              onChange={(v) => patch({ showNotes: v === 'on' })}
            />
          </Field>
        </Card>

        <Card title={t.settings.scoring}>
          <Field label={t.settings.hintPenalty}>
            <Stepper value={draft.hintPenaltySec} min={0} max={300} step={5} onChange={(v) => patch({ hintPenaltySec: v })} />
          </Field>
          <Field label={t.settings.wrongPenalty}>
            <Stepper value={draft.wrongPenaltySec} min={0} max={300} step={1} onChange={(v) => patch({ wrongPenaltySec: v })} />
          </Field>
          <Field label={t.settings.rotation}>
            <Stepper value={draft.rotationSec} min={5} max={120} step={5} onChange={(v) => patch({ rotationSec: v })} />
          </Field>
          <Field label={t.settings.showQr}>
            <Segmented
              value={draft.showQr ? 'on' : 'off'}
              options={[['on', t.settings.on], ['off', t.settings.off]]}
              onChange={(v) => patch({ showQr: v === 'on' })}
            />
          </Field>
        </Card>

        <Card title={t.settings.data}>
          <button className="btn btn-ghost" onClick={exportCsv}>
            ⬇ {t.settings.export}
          </button>
          <a className="btn btn-ghost" href={`${BASE_PATH}leaderboard`} target="_blank" rel="noreferrer">
            ↗ {t.settings.openBoard}
          </a>
          <div className={styles.resetRow}>
            {DIFFICULTIES.map((d) => (
              <button key={d} className="btn btn-danger" onClick={() => reset(d)}>
                {t.settings.reset} {t.difficulty[d]}
              </button>
            ))}
          </div>
          <button className="btn btn-danger" onClick={() => reset()}>
            {t.settings.resetAll}
          </button>
        </Card>

        {DIFFICULTIES.map((d) => (
          <Card key={d} title={t.difficulty[d]} accent={d}>
            <Field label={t.settings.questionsPerRun}>
              <Stepper value={draft.questionsPerRun[d]} min={1} max={20} step={1} onChange={(v) => patchDiff('questionsPerRun', d, v)} />
            </Field>
            <Field label={t.settings.questionMode}>
              <Segmented
                value={draft.questionMode[d]}
                options={QUESTION_MODES.map((m) => [m, t.settings.modes[m]])}
                onChange={(v) => patchDiff('questionMode', d, v)}
              />
            </Field>
            <Field label={t.settings.types}>
              <div className={styles.checks}>
                {QUESTION_TYPES.map((type) => {
                  const on = draft.enabledTypes[d].includes(type);
                  const only = on && draft.enabledTypes[d].length === 1;
                  return (
                    <button
                      key={type}
                      className={`${styles.check} ${on ? styles.on : ''}`}
                      disabled={only}
                      aria-pressed={on}
                      onClick={() =>
                        patchDiff('enabledTypes', d, on ? draft.enabledTypes[d].filter((x) => x !== type) : QUESTION_TYPES.filter((x) => x === type || draft.enabledTypes[d].includes(x)))
                      }
                    >
                      <span>{on ? '✓' : ''}</span>
                      {t.type[type]}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Card>
        ))}
      </main>

      <footer className={styles.footer}>
        <Credits />
      </footer>

      <AnimatePresence>
        {toast && (
          <motion.div className={styles.toast} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Card({ title, accent, children }: { title: string; accent?: Difficulty; children: ReactNode }) {
  return (
    <section className={`${styles.card} ${accent ? styles[accent] : ''}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className={styles.segmented}>
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? styles.on : ''} onClick={() => onChange(v)} aria-pressed={v === value}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange(v: number): void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className={styles.stepper}>
      <button onClick={() => set(value - step)} disabled={value <= min} aria-label="-">
        −
      </button>
      <input
        className="mono"
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(n);
        }}
      />
      <button onClick={() => set(value + step)} disabled={value >= max} aria-label="+">
        +
      </button>
    </div>
  );
}
