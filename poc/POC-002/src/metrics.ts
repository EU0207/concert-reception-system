export interface DistributionSummary {
  count: number;
  minimumMs: number;
  medianMs: number;
  p95Ms: number;
  maximumMs: number;
}

export function summarizeDurations(values: readonly number[]): DistributionSummary {
  if (values.length === 0) throw new Error("集計対象の時間がありません。");
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("時間は0以上の有限値である必要があります。");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    minimumMs: round(sorted[0] ?? 0),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maximumMs: round(sorted.at(-1) ?? 0)
  };
}

export function percentile(sortedValues: readonly number[], proportion: number): number {
  if (sortedValues.length === 0) throw new Error("パーセンタイル対象がありません。");
  if (proportion < 0 || proportion > 1) throw new Error("割合は0～1で指定します。");
  const rank = Math.ceil(proportion * sortedValues.length) - 1;
  return sortedValues[Math.max(0, rank)] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
