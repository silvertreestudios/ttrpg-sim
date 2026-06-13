// ============================================================
// Exact Probability DPR Calculator
// ============================================================
// Computes expected DPR analytically (no simulation).
// Handles:
//   - Halfling Lucky d20 distribution
//   - Advantage via CDF² method
//   - Vex chaining: conditional advantage on next attack given hit
//   - Sharpshooter -5/+10 toggling per attack
//   - Crit doubling of weapon dice + qualifying rider dice
//   - Piercer-style extra die (not doubled)
//   - All rider conditions
// ============================================================

import type { CharacterConfig, AttackConfig, RiderConfig } from '../types.js';
import { parseDice, diceExpectedValue, critExpectedValue } from './dice.js';
import {
  computeHitProbs,
  type HitCritMiss,
  straightDist,
  advantageDist,
} from './halfling-lucky.js';

/** Options to override per-calculation */
export interface CalcOptions {
  overrideSS?: boolean | null;  // null = per-attack setting, true = all SS, false = no SS
  skipSSAtk1?: boolean;         // Skip SS on first attack only
  forceAdvantageAtk1?: boolean; // Surprise or Lucky forces advantage on Atk1
  forceAdvantageAll?: boolean;  // Flanking forces advantage on all attacks
  hexActive?: boolean;          // Hex/concentration is active
  hexRiderIndex?: number;       // Which rider index is Hex
  useActionSurge?: boolean;     // Include Action Surge extra attacks
}

/** Full expected DPR for a character config vs a given AC */
export function calcExpectedDPR(
  config: CharacterConfig,
  ac: number,
  opts: CalcOptions = {}
): number {
  const {
    overrideSS = null,
    skipSSAtk1 = false,
    forceAdvantageAtk1 = false,
    forceAdvantageAll = false,
    hexActive = false,
    useActionSurge = false,
  } = opts;

  const hl = config.feats.halflingLucky;
  const critRange = config.critRange;
  const prof = config.proficiencyBonus;
  const abilMod = config.abilityMod;
  const fightingBonus = config.fightingStyle.bonus;

  // Build the full ordered attack sequence.
  // Action Surge order: Main1, Main2, Surge1, Surge2, OffHand
  // We do this by splitting normal attacks into "main" (pact weapon) and "off-hand",
  // inserting surge attacks after the main attacks, then appending off-hand last.
  // Per the spec: off-hand is the bonus action attack, always last.
  const normalAttacks = [...config.attacks].sort((a, b) => a.order - b.order);

  let allAttacks: AttackConfig[];
  if (useActionSurge && config.actionSurge?.enabled && config.actionSurge.extraAttacks.length > 0) {
    // Partition normal attacks into main-hand (pact) and off-hand
    // Off-hand is the last non-pact attack by order convention
    const mainAttacks = normalAttacks.filter(a => a.isPactWeapon);
    const offHandAttacks = normalAttacks.filter(a => !a.isPactWeapon);

    // Surge attacks are extra main-hand attacks; insert them after normal main attacks
    const surgeAttacks = config.actionSurge.extraAttacks;

    // Final sequence: main attacks → surge attacks → off-hand attacks
    allAttacks = [...mainAttacks, ...surgeAttacks, ...offHandAttacks];
  } else {
    allAttacks = normalAttacks;
  }

  const vexEnabled = config.weaponMastery.vex;

  let pAdvantageForNext = (forceAdvantageAll || forceAdvantageAtk1) ? 1 : 0;

  let totalEV = 0;

  let pFirstPactHitUsed = 0;
  let pFirstHitUsed = 0;

  // Compute distributions once — they don't depend on per-attack values
  const baseDist = straightDist(hl);
  const advDistObj = advantageDist(baseDist);

  for (let i = 0; i < allAttacks.length; i++) {
    const atk = allAttacks[i];

    // Determine SS usage for this attack
    let useSS = false;
    if (overrideSS === true) useSS = true;
    else if (overrideSS === false) useSS = false;
    else if (skipSSAtk1 && i === 0) useSS = false;
    else useSS = config.feats.sharpshooter || config.feats.gwm;

    // Compute hit bonus
    const magicBonus = atk.weapon.magicBonus;
    let hitBonus = prof + fightingBonus + magicBonus;
    if (atk.useAbilityMod) hitBonus += abilMod;
    if (useSS) hitBonus -= 5; // Sharpshooter penalty

    // Needed roll on d20
    const needed = ac - hitBonus;

    const hcmNormal = computeHitProbs(baseDist, needed, critRange);
    const hcmAdv = computeHitProbs(advDistObj, needed, critRange);

    // Blend hit probabilities based on Vex advantage probability
    let hcm: HitCritMiss;
    if (forceAdvantageAll || (forceAdvantageAtk1 && i === 0)) {
      hcm = hcmAdv;
    } else if (vexEnabled && pAdvantageForNext > 0 && pAdvantageForNext < 1) {
      // Blend
      hcm = {
        miss: pAdvantageForNext * hcmAdv.miss + (1 - pAdvantageForNext) * hcmNormal.miss,
        hit: pAdvantageForNext * hcmAdv.hit + (1 - pAdvantageForNext) * hcmNormal.hit,
        crit: pAdvantageForNext * hcmAdv.crit + (1 - pAdvantageForNext) * hcmNormal.crit,
      };
    } else if (vexEnabled && pAdvantageForNext >= 1) {
      hcm = hcmAdv;
    } else {
      hcm = hcmNormal;
    }

    // Compute expected damage for this attack
    const pHit = hcm.hit + hcm.crit;
    const pCrit = hcm.crit;

    // Base weapon damage
    const { numDice: wDice, sides: wSides, flat: wFlat } = parseDice(atk.weapon.damageDice);
    const wFlatMod = wFlat + magicBonus + (atk.useAbilityMod ? abilMod : 0) + (useSS ? 10 : 0);
    const wExpNormal = (wSides > 0 ? wDice * (wSides + 1) / 2 : 0) + wFlatMod;
    const wExpCrit = (wSides > 0 ? 2 * wDice * (wSides + 1) / 2 : 0) + wFlatMod;

    // Piercer: extra die on crit (not doubled)
    let piercerEV = 0;
    if (config.feats.piercer.enabled) {
      piercerEV = diceExpectedValue(config.feats.piercer.die);
    }

    // Expected attack EV (weapon only)
    let attackEV = hcm.hit * wExpNormal + hcm.crit * (wExpCrit + piercerEV);

    // Add rider damage
    for (const rider of config.riders) {
      if (!rider.enabled) continue;

      const riderEV = computeRiderEV(
        rider,
        hcm,
        pFirstHitUsed,
        pFirstPactHitUsed,
        atk,
        hexActive,
        i,
        config
      );
      attackEV += riderEV;
    }

    totalEV += attackEV;

    // Update Vex chain probability for next attack
    // Vex triggers on a HIT (hit or crit)
    if (vexEnabled) {
      pAdvantageForNext = pHit; // P(this attack hit) = P(next has advantage)
    } else {
      pAdvantageForNext = 0;
    }

    // Update pFirstHitUsed
    if (pFirstHitUsed < 1) {
      pFirstHitUsed = pFirstHitUsed + (1 - pFirstHitUsed) * pHit;
    }

    // Update pFirstPactHitUsed
    if (atk.isPactWeapon && pFirstPactHitUsed < 1) {
      pFirstPactHitUsed = pFirstPactHitUsed + (1 - pFirstPactHitUsed) * pHit;
    }
  }

  return totalEV;
}

/** Compute expected EV contribution of a single rider for one attack */
function computeRiderEV(
  rider: RiderConfig,
  hcm: HitCritMiss,
  pFirstHitUsed: number,
  pFirstPactHitUsed: number,
  atk: AttackConfig,
  hexActive: boolean,
  attackIndex: number,
  _config: CharacterConfig,
): number {
  const pHit = hcm.hit + hcm.crit;
  const pCrit = hcm.crit;

  const rNormal = diceExpectedValue(rider.damage);
  const rCrit = rider.doublesOnCrit ? critExpectedValue(rider.damage) : rNormal;

  let pTrigger = 0;
  let pTriggerCrit = 0;

  switch (rider.condition) {
    case 'onEveryHit':
      pTrigger = hcm.hit;
      pTriggerCrit = hcm.crit;
      break;

    case 'firstHitPerTurn':
      // P(rider fires on this attack) = P(first hit hasn't happened yet) * P(this attack hits)
      pTrigger = (1 - pFirstHitUsed) * hcm.hit;
      pTriggerCrit = (1 - pFirstHitUsed) * hcm.crit;
      break;

    case 'firstHitPactWeapon':
      if (!atk.isPactWeapon) return 0;
      pTrigger = (1 - pFirstPactHitUsed) * hcm.hit;
      pTriggerCrit = (1 - pFirstPactHitUsed) * hcm.crit;
      break;

    case 'onCritPactWeaponOnly':
      if (!atk.isPactWeapon) return 0;
      pTrigger = 0;
      pTriggerCrit = pCrit;
      break;

    case 'onCritAnyWeapon':
      pTrigger = 0;
      pTriggerCrit = pCrit;
      break;

    case 'onHitWhileActive':
      if (!hexActive) return 0;
      pTrigger = hcm.hit;
      pTriggerCrit = hcm.crit;
      break;

    default:
      return 0;
  }

  // Placement filtering: if "prefer second attack" and we're not on attack index 1, skip
  // (This is approximate — for exact calc we treat it as firing on the correct attack)
  if (rider.placement === 'preferSecondAttack' && attackIndex !== 1 && rider.condition === 'firstHitPactWeapon') {
    // Only trigger on second attack (index 1) unless it's the only pact weapon attack
    // Approximate: if index is not 1, reduce probability by spreading over expected first-hit timing
    // For simplicity in exact calc: just let it fire whenever first pact weapon hits
  }

  return pTrigger * rNormal + pTriggerCrit * rCrit;
}

/** Compute DPR for multiple scenarios across a range of ACs */
export interface DPRScenario {
  label: string;
  color: string;
  data: number[]; // one per AC value
}

export interface DPRCurveResult {
  acs: number[];
  scenarios: DPRScenario[];
  breakpoints: { allSSvsSkip: number; skipSSvsNoSS: number };
}

export function calcDPRCurve(config: CharacterConfig): DPRCurveResult {
  const acs = Array.from({ length: 16 }, (_, i) => i + 10); // AC 10-25

  const hasSS = config.feats.sharpshooter || config.feats.gwm;

  // Derive forced-advantage flags from config so sidebar toggles affect DPR tab
  const forceAdv1 = config.advantageSources.surprise || config.advantageSources.luckyOnAtk1;
  const forceAdvAll = config.advantageSources.flanking;

  const scenarios: DPRScenario[] = [];

  // All SS (if feat enabled)
  if (hasSS) {
    scenarios.push({
      label: 'All Sharpshooter',
      color: '#f59e0b',
      data: acs.map(ac => calcExpectedDPR(config, ac, {
        overrideSS: true,
        forceAdvantageAtk1: forceAdv1,
        forceAdvantageAll: forceAdvAll,
      })),
    });
  }

  // Skip SS on Atk1
  if (hasSS) {
    scenarios.push({
      label: 'Skip SS Atk 1',
      color: '#10b981',
      data: acs.map(ac => calcExpectedDPR(config, ac, {
        skipSSAtk1: true,
        forceAdvantageAtk1: forceAdv1,
        forceAdvantageAll: forceAdvAll,
      })),
    });
  }

  // No SS
  scenarios.push({
    label: 'No Sharpshooter',
    color: '#6366f1',
    data: acs.map(ac => calcExpectedDPR(config, ac, {
      overrideSS: false,
      forceAdvantageAtk1: forceAdv1,
      forceAdvantageAll: forceAdvAll,
    })),
  });

  // With Lucky (advantage on Atk1) + All SS
  if (config.feats.lucky.enabled && hasSS) {
    scenarios.push({
      label: 'Lucky + All SS',
      color: '#ec4899',
      data: acs.map(ac => calcExpectedDPR(config, ac, {
        overrideSS: true,
        forceAdvantageAtk1: true,
        forceAdvantageAll: forceAdvAll,
      })),
    });
  }

  // Action Surge scenario (if enabled in config)
  if (config.actionSurge?.enabled && config.actionSurge.extraAttacks.length > 0) {
    if (hasSS) {
      scenarios.push({
        label: 'Action Surge (All SS)',
        color: '#ef4444',
        data: acs.map(ac => calcExpectedDPR(config, ac, {
          overrideSS: true,
          useActionSurge: true,
          forceAdvantageAtk1: forceAdv1,
          forceAdvantageAll: forceAdvAll,
        })),
      });
    } else {
      scenarios.push({
        label: 'Action Surge',
        color: '#ef4444',
        data: acs.map(ac => calcExpectedDPR(config, ac, {
          useActionSurge: true,
          forceAdvantageAtk1: forceAdv1,
          forceAdvantageAll: forceAdvAll,
        })),
      });
    }
  }

  // With Hex active
  const hasHex = config.riders.some(r => r.condition === 'onHitWhileActive');
  if (hasHex) {
    scenarios.push({
      label: hasSS ? 'All SS + Hex' : 'With Hex',
      color: '#8b5cf6',
      data: acs.map(ac => calcExpectedDPR(config, ac, {
        overrideSS: hasSS ? true : null,
        hexActive: true,
        forceAdvantageAtk1: forceAdv1,
        forceAdvantageAll: forceAdvAll,
      })),
    });
  }

  // Find breakpoints
  let allSSvsSkip = 30;
  let skipSSvsNoSS = 30;

  if (hasSS) {
    const allSSScenario = scenarios.find(s => s.label === 'All Sharpshooter');
    const skipScenario = scenarios.find(s => s.label === 'Skip SS Atk 1');
    const noSSScenario = scenarios.find(s => s.label === 'No Sharpshooter');

    if (allSSScenario && skipScenario) {
      for (let i = 0; i < acs.length - 1; i++) {
        if (allSSScenario.data[i] >= skipScenario.data[i] &&
            allSSScenario.data[i + 1] < skipScenario.data[i + 1]) {
          allSSvsSkip = acs[i + 1];
          break;
        }
      }
    }

    if (skipScenario && noSSScenario) {
      for (let i = 0; i < acs.length - 1; i++) {
        if (skipScenario.data[i] >= noSSScenario.data[i] &&
            skipScenario.data[i + 1] < noSSScenario.data[i + 1]) {
          skipSSvsNoSS = acs[i + 1];
          break;
        }
      }
    }
  }

  return { acs, scenarios, breakpoints: { allSSvsSkip, skipSSvsNoSS } };
}
