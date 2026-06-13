// ============================================================
// Surprise Round Comparison Analysis
// ============================================================

import type { CharacterConfig } from '../types.js';
import { calcExpectedDPR } from '../engine/probability.js';

export interface SurpriseScenario {
  label: string;
  color: string;
  data: number[];
}

export interface SurpriseAnalysisResult {
  acs: number[];
  scenarios: SurpriseScenario[];
  threeRoundTable: ThreeRoundRow[];
}

export interface ThreeRoundRow {
  strategy: string;
  rnd1: number;
  rnd2: number;
  rnd3: number;
  total: number;
  avgPerRound: number;
}

export function analyzeSurprise(config: CharacterConfig): SurpriseAnalysisResult {
  const acs = [14, 16, 18, 20];

  const hasHex = config.riders.some(r => r.condition === 'onHitWhileActive');
  const hasSS = config.feats.sharpshooter || config.feats.gwm;

  const scenarios: SurpriseScenario[] = [];

  // Scenario 1: Surprise, no Hex
  scenarios.push({
    label: 'Surprise (no spell)',
    color: '#f59e0b',
    data: acs.map(ac => calcExpectedDPR(config, ac, {
      overrideSS: hasSS ? true : null,
      forceAdvantageAtk1: true,
      hexActive: false,
    })),
  });

  // Scenario 2: Surprise + Hex already pre-cast
  if (hasHex) {
    scenarios.push({
      label: 'Surprise + Spell pre-cast',
      color: '#10b981',
      data: acs.map(ac => calcExpectedDPR(config, ac, {
        overrideSS: hasSS ? true : null,
        forceAdvantageAtk1: true,
        hexActive: true,
      })),
    });
  }

  // Scenario 3: Normal round (no surprise)
  scenarios.push({
    label: 'Normal round',
    color: '#6366f1',
    data: acs.map(ac => calcExpectedDPR(config, ac, {
      overrideSS: hasSS ? true : null,
      hexActive: false,
    })),
  });

  // 3-round combat table (for AC 16)
  const ac = 16;
  const threeRoundTable: ThreeRoundRow[] = [];

  // Normal baseline (no hex, no surprise)
  const normalDPR = calcExpectedDPR(config, ac, { overrideSS: hasSS ? true : null });
  threeRoundTable.push({
    strategy: 'Normal (no spell, baseline)',
    rnd1: normalDPR,
    rnd2: normalDPR,
    rnd3: normalDPR,
    total: normalDPR * 3,
    avgPerRound: normalDPR,
  });

  // Surprise, no Hex
  const surpriseDPR = calcExpectedDPR(config, ac, {
    overrideSS: hasSS ? true : null,
    forceAdvantageAtk1: true,
    hexActive: false,
  });
  threeRoundTable.push({
    strategy: 'Surprise, no spell',
    rnd1: surpriseDPR,
    rnd2: normalDPR,
    rnd3: normalDPR,
    total: surpriseDPR + normalDPR * 2,
    avgPerRound: (surpriseDPR + normalDPR * 2) / 3,
  });

  if (hasHex) {
    const surpriseHexDPR = calcExpectedDPR(config, ac, {
      overrideSS: hasSS ? true : null,
      forceAdvantageAtk1: true,
      hexActive: true,
    });
    const hexActiveDPR = calcExpectedDPR(config, ac, {
      overrideSS: hasSS ? true : null,
      hexActive: true,
    });

    // Reduced-attack round (applying hex)
    const reducedConfig = {
      ...config,
      attacks: config.attacks.slice(0, config.attacks.length - 1),
    };
    const applyHexDPR = calcExpectedDPR(reducedConfig, ac, { hexActive: true });

    // Surprise + Hex pre-cast (all 3 rounds)
    threeRoundTable.push({
      strategy: 'Surprise + Spell pre-cast',
      rnd1: surpriseHexDPR,
      rnd2: hexActiveDPR,
      rnd3: hexActiveDPR,
      total: surpriseHexDPR + hexActiveDPR * 2,
      avgPerRound: (surpriseHexDPR + hexActiveDPR * 2) / 3,
    });

    // Surprise rnd 1, cast Hex rnd 2
    threeRoundTable.push({
      strategy: 'Surprise rnd 1, cast spell rnd 2',
      rnd1: surpriseDPR,
      rnd2: applyHexDPR,
      rnd3: hexActiveDPR,
      total: surpriseDPR + applyHexDPR + hexActiveDPR,
      avgPerRound: (surpriseDPR + applyHexDPR + hexActiveDPR) / 3,
    });

    // Hex active (no surprise, sustained)
    threeRoundTable.push({
      strategy: 'No surprise, spell active (sustained)',
      rnd1: hexActiveDPR,
      rnd2: hexActiveDPR,
      rnd3: hexActiveDPR,
      total: hexActiveDPR * 3,
      avgPerRound: hexActiveDPR,
    });
  }

  return { acs, scenarios, threeRoundTable };
}
