import type { Lang } from '@cc/shared';
import { useSettings } from '../store/settings';
import styles from './LangToggle.module.css';

const LANGS: Lang[] = ['nl', 'en'];

export function LangToggle() {
  const { lang, setLang } = useSettings();
  return (
    <div className={styles.toggle} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l} className={l === lang ? styles.active : ''} onClick={() => setLang(l)} aria-pressed={l === lang}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
