// ============================================================
// DPR Curve Analysis
// ============================================================

import type { CharacterConfig } from '../types.js';
import { calcDPRCurve, type DPRCurveResult } from '../engine/probability.js';

export type { DPRCurveResult };

export function analyzeDPRCurve(config: CharacterConfig): DPRCurveResult {
  return calcDPRCurve(config);
}

/** Build a markdown/HTML table from DPR curve results */
export interface DPRTableRow {
  ac: number;
  values: { label: string; dpr: number; isBest: boolean }[];
}

export function buildDPRTable(result: DPRCurveResult): DPRTableRow[] {
  return result.acs.map((ac, idx) => {
    const dprs = result.scenarios.map(s => s.data[idx]);
    const maxDPR = Math.max(...dprs);
    return {
      ac,
      values: result.scenarios.map(s => ({
        label: s.label,
        dpr: s.data[idx],
        isBest: Math.abs(s.data[idx] - maxDPR) < 0.01,
      })),
    };
  });
}
