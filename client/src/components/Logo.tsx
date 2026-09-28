import { BASE_PATH } from '../lib/config';
import styles from './Logo.module.css';

/** The official via logo (from svia.nl/huisstijl): white on the dark theme, via-blue on light. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className={`${styles.logo} ${styles[size]}`}>
      <img className={styles.onDark} src={`${BASE_PATH}brand/via-logo-white.svg`} alt="via" />
      <img className={styles.onLight} src={`${BASE_PATH}brand/via-logo-blue.svg`} alt="via" />
      <span className={styles.divider} aria-hidden />
      <span className={styles.text}>Code Challenge</span>
    </div>
  );
}
