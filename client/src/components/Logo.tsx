import styles from './Logo.module.css';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className={`${styles.logo} ${styles[size]}`}>
      <span className={styles.mark} aria-hidden>
        <svg viewBox="0 0 32 32">
          <path d="M12 10l-6 6 6 6M20 10l6 6-6 6" />
        </svg>
      </span>
      <span className={styles.text}>
        <b>SVIA</b> Code Challenge
      </span>
    </div>
  );
}
