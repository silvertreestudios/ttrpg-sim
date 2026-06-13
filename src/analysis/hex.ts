// ============================================================
// Hex / Concentration Spell Break-Even Analysis
// ============================================================

import type { CharacterConfig } from '../types.js';
import { calcExpectedDPR } from '../engine/probability.js';

export interface HexScenario {
  label: string;
  dpr: number;
  color: string;
}

export interface HexBreakEvenRow {
  roundsOnTarget: number; // number of rounds target lives
  amortizedDPR: number;
  vsBenchmark: number;
  worth: boolean;
}

export interface HexAnalysisResult {
  scenarios: HexScenario[];
  breakEvenRounds: number | null;
  amortizedTable: HexBreakEvenRow[];
}

/** Analyze Hex value at a given AC */
export function analyzeHex(config: CharacterConfig, ac: number): HexAnalysisResult {
  // Find the Hex rider index
  const hexRiderIndex = config.riders.findIndex(r => r.condition === 'onHitWhileActive');

  // If no Hex-like rider, return empty analysis
  if (hexRiderIndex === -1) {
    const noHexDPR = calcExpectedDPR(config, ac, { hexActive: false });
    return {
      scenarios: [
        { label: 'No Concentration Spell', dpr: noHexDPR, color: '#6366f1' },
      ],
      breakEvenRounds: null,
      amortizedTable: [],
    };
  }

  const hexRider = config.riders[hexRiderIndex];
  const requiresBA = hexRider.requiresBonusAction;

  // Scenario 1: No Hex
  const noHexDPR = calcExpectedDPR(config, ac, { hexActive: false });

  // Scenario 2: Hex active, all attacks (steady state)
  const hexActiveDPR = calcExpectedDPR(config, ac, { hexActive: true });

  // Scenario 3: Applying Hex (costs bonus action = lose off-hand attack if BA attack)
  // We simulate this by removing the last attack if requiresBA
  let applyHexDPR: number;
  if (requiresBA) {
    // Create a config without the last attack
    const reducedConfig = {
      ...config,
      attacks: config.attacks.slice(0, config.attacks.length - 1),
    };
    applyHexDPR = calcExpectedDPR(reducedConfig, ac, { hexActive: true });
  } else {
    applyHexDPR = hexActiveDPR; // No cost if no BA required
  }

  const scenarios: HexScenario[] = [
    { label: 'No Spell', dpr: noHexDPR, color: '#6366f1' },
    { label: 'Spell Active (full attacks)', dpr: hexActiveDPR, color: '#10b981' },
  ];

  if (requiresBA) {
    scenarios.push({ label: 'Applying Spell (reduced attacks)', dpr: applyHexDPR, color: '#f59e0b' });
  }

  // Amortized DPR by reapplication frequency
  // If we apply Hex every N rounds:
  //   Round 1: applyHexDPR (casting costs BA / attack)
  //   Rounds 2..N: hexActiveDPR
  // Amortized = (applyHexDPR + (N-1) * hexActiveDPR) / N

  const amortizedTable: HexBreakEvenRow[] = [];
  let breakEvenRounds: number | null = null;

  for (let n = 1; n <= 10; n++) {
    const amortized = requiresBA
      ? (applyHexDPR + (n - 1) * hexActiveDPR) / n
      : hexActiveDPR;

    const vsBenchmark = amortized - noHexDPR;
    const worth = vsBenchmark > 0;

    if (worth && breakEvenRounds === null) {
      breakEvenRounds = n;
    }

    amortizedTable.push({
      roundsOnTarget: n,
      amortizedDPR: amortized,
      vsBenchmark,
      worth,
    });
  }

  // Add "never reapply" row
  const amortizedTable2: HexBreakEvenRow[] = [...amortizedTable];
  amortizedTable2.push({
    roundsOnTarget: 999,
    amortizedDPR: hexActiveDPR,
    vsBenchmark: hexActiveDPR - noHexDPR,
    worth: hexActiveDPR > noHexDPR,
  });

  return {
    scenarios,
    breakEvenRounds,
    amortizedTable: amortizedTable2,
  };
}
