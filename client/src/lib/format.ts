/** 83456 -> "01:23.4" (or "01:23.45" with precision 2). */
export function formatTime(ms: number, precision: 1 | 2 = 1): string {
  const safe = Math.max(0, ms);
  const min = Math.floor(safe / 60000);
  const sec = Math.floor((safe % 60000) / 1000);
  const frac = Math.floor((safe % 1000) / (precision === 1 ? 100 : 10));
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(frac).padStart(precision, '0')}`;
}
