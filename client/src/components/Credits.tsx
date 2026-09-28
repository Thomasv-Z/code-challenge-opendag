import { useT } from '../i18n';
import { BASE_PATH } from '../lib/config';
import styles from './Credits.module.css';

/** Plain text on purpose: a link would let kiosk visitors wander off the game. */
export function Credits({ className }: { className?: string }) {
  const t = useT();
  return (
    <p className={`${styles.credits} ${className ?? ''}`}>
      <img className={styles.onDark} src={`${BASE_PATH}brand/via-mark-white.svg`} alt="" />
      <img className={styles.onLight} src={`${BASE_PATH}brand/via-mark-blue.svg`} alt="" />
      <span>{t.credits}</span>
      <span className={styles.dot}>·</span>
      <span>svia.nl</span>
    </p>
  );
}
