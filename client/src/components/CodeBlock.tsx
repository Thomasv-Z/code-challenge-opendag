import type { CSSProperties } from 'react';
import { tokenizeLine } from '../lib/highlight';
import styles from './CodeBlock.module.css';

interface Props {
  code: string;
  highlightLine?: number;
  className?: string;
}

export function CodeBlock({ code, highlightLine, className }: Props) {
  const lines = code.split('\n');
  return (
    <div className={`${styles.block} ${className ?? ''}`} style={{ '--lines': lines.length } as CSSProperties}>
      <div className={styles.chrome}>
        <span />
        <span />
        <span />
        <em>main.py</em>
      </div>
      <pre className={styles.pre}>
        {lines.map((line, i) => (
          <div key={i} className={`${styles.line} ${highlightLine === i + 1 ? styles.bug : ''}`}>
            <span className={styles.num}>{i + 1}</span>
            <code>
              {tokenizeLine(line).map((t, j) => (
                <span key={j} className={styles[t.kind]}>
                  {t.text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}
