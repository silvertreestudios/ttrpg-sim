// ============================================================
// Monte Carlo Simulation Engine
// Runs inside a Web Worker for non-blocking computation.
// ============================================================

import type { CharacterConfig, RiderConfig, AttackConfig } from '../types.js';
import {
  parseDice,
  rollDie,
  rollExpr,
  rollExprCrit,
  rollD20,
  rollD20Advantage,
} from './dice.js';

export interface SimOptions {
  simCount: number;
  targetAC: number;
  hasSurprise?: boolean;
  hexActive?: boolean;
  overrideSS?: boolean | null;
  skipSSAtk1?: boolean;
  forceAdvantageAtk1?: boolean;
  forceAdvantageAll?: boolean;
  useActionSurge?: boolean;
}

export interface RoundResult {
  totalDamage: number;
  critCount: number;
}

/** Simulate a single round of combat, returning total damage */
export function simulateRound(
  config: CharacterConfig,
  opts: SimOptions,
): RoundResult {
  const {
    targetAC,
    hexActive = false,
    overrideSS = null,
    skipSSAtk1 = false,
    forceAdvantageAtk1 = false,
    forceAdvantageAll = false,
    useActionSurge = false,
  } = opts;

  const hl = config.feats.halflingLucky;
  const critRange = config.critRange;
  const prof = config.proficiencyBonus;
  const abilMod = config.abilityMod;
  const fightingBonus = config.fightingStyle.bonus;
  const vexEnabled = config.weaponMastery.vex;

  // Build the full ordered attack sequence, same logic as probability.ts
  const normalAttacks = [...config.attacks].sort((a, b) => a.order - b.order);

  let attacks: AttackConfig[];
  if (useActionSurge && config.actionSurge?.enabled && config.actionSurge.extraAttacks.length > 0) {
    const mainAttacks = normalAttacks.filter(a => a.isPactWeapon);
    const offHandAttacks = normalAttacks.filter(a => !a.isPactWeapon);
    const surgeAttacks = config.actionSurge.extraAttacks;
    attacks = [...mainAttacks, ...surgeAttacks, ...offHandAttacks];
  } else {
    attacks = normalAttacks;
  }

  let totalDamage = 0;
  let critCount = 0;
  let hasAdvantage = forceAdvantageAll || forceAdvantageAtk1;
  let firstHitDone = false;
  let firstPactHitDone = false;
  let punctureUsed = false;
  const riderUsedCount = new Map<string, number>();

  for (let i = 0; i < attacks.length; i++) {
    const atk = attacks[i];

    // After first attack, clear forced advantage (unless forceAdvantageAll)
    if (i > 0 && forceAdvantageAtk1 && !forceAdvantageAll) {
      hasAdvantage = false;
    }

    // Determine SS usage
    let useSS = false;
    if (overrideSS === true) useSS = true;
    else if (overrideSS === false) useSS = false;
    else if (skipSSAtk1 && i === 0) useSS = false;
    else useSS = config.feats.sharpshooter || config.feats.gwm;

    // Compute hit bonus
    let hitBonus = prof + fightingBonus + atk.weapon.magicBonus;
    if (atk.useAbilityMod) hitBonus += abilMod;
    if (useSS) hitBonus -= 5;

    // Roll d20
    let d20Roll: number;
    if (forceAdvantageAll || hasAdvantage) {
      d20Roll = rollD20Advantage(hl);
    } else {
      d20Roll = rollD20(hl);
    }

    // Determine result
    const isCrit = d20Roll >= critRange;
    const isHit = isCrit || (d20Roll !== 1 && d20Roll + hitBonus >= targetAC);

    if (!isHit) {
      // Miss — no damage, no Vex
      if (vexEnabled) hasAdvantage = false;
      continue;
    }

    // Hit or crit
    if (isCrit) critCount++;
    if (vexEnabled) hasAdvantage = true; // Vex: next attack has advantage

    // Roll weapon damage
    const { numDice: wDice, sides: wSides } = parseDice(atk.weapon.damageDice);
    let weaponDmg = 0;
    let lowestDieIdx = -1;
    let lowestDieVal = Infinity;
    const weaponRolls: number[] = [];

    if (wSides > 0) {
      const rolls = isCrit ? wDice * 2 : wDice;
      for (let r = 0; r < rolls; r++) {
        const roll = rollDie(wSides);
        weaponRolls.push(roll);
        weaponDmg += roll;
        // Track lowest roll for Puncture reroll
        if (roll < lowestDieVal) {
          lowestDieVal = roll;
          lowestDieIdx = r;
        }
      }
    }

    // Piercer Puncture: once per turn, reroll one weapon die that rolled 1
    if (config.feats.piercer.enabled && config.feats.piercer.puncture && !punctureUsed) {
      if (lowestDieIdx >= 0 && lowestDieVal === 1 && wSides > 0) {
        const reroll = rollDie(wSides);
        weaponDmg += (reroll - 1); // replace the 1 with new roll
        punctureUsed = true;
      }
    }

    weaponDmg += atk.weapon.magicBonus;
    if (atk.useAbilityMod) weaponDmg += abilMod;
    if (useSS) weaponDmg += 10;

    // Piercer: extra die on crit (not doubled)
    if (isCrit && config.feats.piercer.enabled) {
      weaponDmg += rollExpr(config.feats.piercer.die);
    }

    totalDamage += weaponDmg;

    // Process riders
    for (const rider of config.riders) {
      if (!rider.enabled) continue;

      const usedCount = riderUsedCount.get(rider.name) ?? 0;
      if (rider.perTurnLimit > 0 && usedCount >= rider.perTurnLimit) continue;

      let fires = false;

      switch (rider.condition) {
        case 'onEveryHit':
          fires = true;
          break;
        case 'firstHitPerTurn':
          fires = !firstHitDone;
          break;
        case 'firstHitPactWeapon':
          fires = atk.isPactWeapon && !firstPactHitDone;
          break;
        case 'onCritPactWeaponOnly':
          fires = atk.isPactWeapon && isCrit;
          break;
        case 'onCritAnyWeapon':
          fires = isCrit;
          break;
        case 'onHitWhileActive':
          fires = hexActive;
          break;
      }

      if (!fires) continue;

      // Roll rider damage
      let riderDmg = 0;
      if (isCrit && rider.doublesOnCrit) {
        riderDmg = rollExprCrit(rider.damage);
      } else {
        riderDmg = rollExpr(rider.damage);
      }

      totalDamage += riderDmg;
      riderUsedCount.set(rider.name, usedCount + 1);
    }

    firstHitDone = true;
    if (atk.isPactWeapon) firstPactHitDone = true;
  }

  return { totalDamage, critCount };
}

/** Run full Monte Carlo simulation, returning histogram and percentiles */
export interface MonteCarloResult {
  histogram: Map<number, number>; // damage -> count
  avg: number;
  percentiles: {
    p10: number; p25: number; p50: number; p75: number;
    p90: number; p95: number; p99: number; max: number;
  };
  whiffRate: number;
  critRounds: {
    noCrit: { count: number; totalDmg: number };
    singleCrit: { count: number; totalDmg: number };
    doublePlus: { count: number; totalDmg: number };
  };
  killProbs: { hp: number; prob: number }[];
  damages: number[]; // sorted array of all damages
}

export function runMonteCarlo(
  config: CharacterConfig,
  opts: SimOptions,
  progressCb?: (pct: number) => void,
): MonteCarloResult {
  const { simCount } = opts;
  const damages: number[] = new Array(simCount);
  const crits: number[] = new Array(simCount);
  const histogram = new Map<number, number>();

  const PROGRESS_INTERVAL = Math.floor(simCount / 20);

  for (let i = 0; i < simCount; i++) {
    const result = simulateRound(config, opts);
    damages[i] = result.totalDamage;
    crits[i] = result.critCount;

    const bin = result.totalDamage;
    histogram.set(bin, (histogram.get(bin) ?? 0) + 1);

    if (progressCb && i % PROGRESS_INTERVAL === 0) {
      progressCb(i / simCount);
    }
  }

  damages.sort((a, b) => a - b);

  const avg = damages.reduce((s, d) => s + d, 0) / simCount;
  const whiffRate = damages.filter(d => d === 0).length / simCount;

  const getPercentile = (p: number) => damages[Math.floor(p * simCount)];

  // Kill probabilities
  const hpThresholds = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 150];
  const killProbs = hpThresholds.map(hp => ({
    hp,
    prob: damages.filter(d => d >= hp).length / simCount,
  }));

  // Crit round breakdown
  const noCritRounds = { count: 0, totalDmg: 0 };
  const singleCritRounds = { count: 0, totalDmg: 0 };
  const doublePlusRounds = { count: 0, totalDmg: 0 };
  for (let i = 0; i < simCount; i++) {
    if (crits[i] === 0) { noCritRounds.count++; noCritRounds.totalDmg += damages[i]; }
    else if (crits[i] === 1) { singleCritRounds.count++; singleCritRounds.totalDmg += damages[i]; }
    else { doublePlusRounds.count++; doublePlusRounds.totalDmg += damages[i]; }
  }

  if (progressCb) progressCb(1);

  return {
    histogram,
    avg,
    percentiles: {
      p10: getPercentile(0.10),
      p25: getPercentile(0.25),
      p50: getPercentile(0.50),
      p75: getPercentile(0.75),
      p90: getPercentile(0.90),
      p95: getPercentile(0.95),
      p99: getPercentile(0.99),
      max: damages[damages.length - 1],
    },
    whiffRate,
    critRounds: {
      noCrit: noCritRounds,
      singleCrit: singleCritRounds,
      doublePlus: doublePlusRounds,
    },
    killProbs,
    damages,
  };
}

/** Mook simulation: simulate killing multiple mooks with target-switching */
export interface MookSimOptions {
  simCount: number;
  mookAC: number;
  mookHP: number;
  hasSurprise: boolean;
}

export interface MookSimResult {
  avgKills: number;
  killDistribution: number[];  // normalized probabilities
  avgBoltsPerKill: number;
  overkillTax: number;
  simCount: number;
}

export function runMookSim(
  config: CharacterConfig,
  opts: MookSimOptions,
  progressCb?: (pct: number) => void,
): MookSimResult {
  const { simCount, mookAC, mookHP, hasSurprise } = opts;

  const hl = config.feats.halflingLucky;
  const critRange = config.critRange;
  const prof = config.proficiencyBonus;
  const abilMod = config.abilityMod;
  const fightingBonus = config.fightingStyle.bonus;
  const vexEnabled = config.weaponMastery.vex;
  const attacks = [...config.attacks].sort((a, b) => a.order - b.order);

  const killCounts: number[] = new Array(simCount);
  let totalBolts = 0;
  let totalKills = 0;
  let totalOverkill = 0;
  let totalDamageIfNoOverkill = 0;

  const PROGRESS_INTERVAL = Math.floor(simCount / 20);

  for (let sim = 0; sim < simCount; sim++) {
    if (progressCb && sim % PROGRESS_INTERVAL === 0) {
      progressCb(sim / simCount);
    }

    let kills = 0;
    let currentMookHP = mookHP;
    let hasAdvantage = hasSurprise;

    for (let i = 0; i < attacks.length; i++) {
      const atk = attacks[i];
      if (i > 0 && hasSurprise && !vexEnabled) hasAdvantage = false;

      const useSS = config.feats.sharpshooter || config.feats.gwm;
      let hitBonus = prof + fightingBonus + atk.weapon.magicBonus;
      if (atk.useAbilityMod) hitBonus += abilMod;
      if (useSS) hitBonus -= 5;

      const d20Roll = hasAdvantage ? rollD20Advantage(hl) : rollD20(hl);
      const isCrit = d20Roll >= critRange;
      const isHit = isCrit || (d20Roll !== 1 && d20Roll + hitBonus >= mookAC);

      if (!isHit) {
        if (vexEnabled) hasAdvantage = false;
        totalBolts++;
        continue;
      }

      if (vexEnabled) hasAdvantage = true;
      totalBolts++;

      // Roll damage
      const { numDice: wDice, sides: wSides } = parseDice(atk.weapon.damageDice);
      let dmg = 0;
      if (wSides > 0) {
        const rolls = isCrit ? wDice * 2 : wDice;
        for (let r = 0; r < rolls; r++) dmg += rollDie(wSides);
      }
      dmg += atk.weapon.magicBonus;
      if (atk.useAbilityMod) dmg += abilMod;
      if (useSS) dmg += 10;

      totalDamageIfNoOverkill += dmg;

      const actualDmg = Math.min(dmg, currentMookHP);
      const overkill = dmg - actualDmg;
      totalOverkill += overkill;
      currentMookHP -= actualDmg;

      if (currentMookHP <= 0) {
        kills++;
        totalKills++;
        currentMookHP = mookHP; // switch to next mook
        if (!vexEnabled) hasAdvantage = false; // new target, no Vex
      }
    }

    killCounts[sim] = kills;
  }

  if (progressCb) progressCb(1);

  const avgKills = totalKills / simCount;
  const avgBoltsPerKill = totalKills > 0 ? totalBolts / totalKills : totalBolts;
  const overkillTax = totalDamageIfNoOverkill > 0
    ? totalOverkill / totalDamageIfNoOverkill
    : 0;

  const maxKills = Math.max(...killCounts);
  const killDist = new Array(maxKills + 1).fill(0);
  for (const k of killCounts) killDist[k]++;
  const killDistNorm = killDist.map(c => c / simCount);

  return {
    avgKills,
    killDistribution: killDistNorm,
    avgBoltsPerKill,
    overkillTax,
    simCount,
  };
}
