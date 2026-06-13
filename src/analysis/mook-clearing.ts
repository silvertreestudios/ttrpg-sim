// ============================================================
// Mook Clearing Analysis
// ============================================================
// Uses Monte Carlo simulation via the worker.

import type { MookSimResult } from '../types.js';

export interface MookPreset {
  label: string;
  ac: number;
  hp: number;
  cr: string;
}

export const MOOK_PRESETS: MookPreset[] = [
  { label: 'Minion (CR ½)', ac: 13, hp: 20, cr: 'CR ½' },
  { label: 'Light (CR 1)', ac: 13, hp: 25, cr: 'CR 1' },
  { label: 'Standard (CR 2)', ac: 14, hp: 35, cr: 'CR 2' },
  { label: 'Tough (CR 3)', ac: 14, hp: 45, cr: 'CR 3' },
  { label: 'Brute (CR 3-4)', ac: 15, hp: 55, cr: 'CR 3-4' },
  { label: 'Elite (CR 4-5)', ac: 15, hp: 65, cr: 'CR 4-5' },
];

export interface MookResultDisplay {
  avgKills: number;
  killDistRows: { kills: number; prob: number }[];
  avgBoltsPerKill: number;
  overkillPct: number;
}

export function buildMookDisplay(result: MookSimResult): MookResultDisplay {
  const killDistRows = result.killDistribution.map((prob, kills) => ({ kills, prob }));

  return {
    avgKills: result.avgKills,
    killDistRows,
    avgBoltsPerKill: result.avgBoltsPerKill,
    overkillPct: result.overkillTax * 100,
  };
}
