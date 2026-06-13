// ============================================================
// Burst Distribution Analysis (wraps Monte Carlo results)
// ============================================================

import type { CharacterConfig, MonteCarloResult, BurstPercentiles } from '../types.js';

/** Build percentile summary from MC result */
export function buildPercentileTable(
  _config: CharacterConfig,
  result: MonteCarloResult,
): BurstPercentiles {
  return result.percentiles;
}

/** Build histogram bins for chart (group into damage buckets of width 5) */
export interface HistogramBin {
  label: string;
  count: number;
  isP50: boolean;
  isP90: boolean;
}

export function buildHistogramBins(
  histData: { damage: number; count: number }[],
  simCount: number,
  p50: number,
  p90: number,
): HistogramBin[] {
  if (histData.length === 0) return [];

  const maxDmg = Math.max(...histData.map(h => h.damage));
  const BIN_WIDTH = 5;
  const numBins = Math.ceil(maxDmg / BIN_WIDTH) + 1;

  const bins: number[] = new Array(numBins).fill(0);
  for (const { damage, count } of histData) {
    const binIdx = Math.floor(damage / BIN_WIDTH);
    if (binIdx < numBins) bins[binIdx] += count;
  }

  return bins.map((count, i) => {
    const lo = i * BIN_WIDTH;
    const hi = lo + BIN_WIDTH - 1;
    const midpoint = lo + Math.floor(BIN_WIDTH / 2);
    return {
      label: `${lo}-${hi}`,
      count: count / simCount, // normalize to probability
      isP50: Math.abs(midpoint - p50) < BIN_WIDTH,
      isP90: Math.abs(midpoint - p90) < BIN_WIDTH,
    };
  });
}

/** Build summary burst table comparing across ACs */
export interface BurstACSummaryRow {
  ac: number;
  avg: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  ge70: number;
  ge90: number;
  ge110: number;
}
