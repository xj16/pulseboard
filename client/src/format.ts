import type { MetricMeta } from './protocol';

/** Format a value with its metric's precision and a compact suffix. */
export function formatValue(value: number, meta?: MetricMeta): string {
  const precision = meta?.precision ?? 0;
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return value.toFixed(precision);
}

/** Full unit-annotated string, e.g. "4.2k req/s". */
export function formatWithUnit(value: number, meta?: MetricMeta): string {
  const num = formatValue(value, meta);
  const unit = meta?.unit ?? '';
  if (unit === '$') return `$${num}`;
  return unit ? `${num} ${unit}` : num;
}
