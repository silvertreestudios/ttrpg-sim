import { afterEach, describe, expect, it, vi } from 'vitest';
import crossbowPreset from '../presets/crossbow-champion.json';
import type { CharacterConfig } from '../types.js';
import { normalizeConfig } from '../config.js';
import { advantageDist, computeHitProbs, straightDist } from './halfling-lucky.js';
import { calcExpectedDPR } from './probability.js';
import { runMookSim, simulateRound } from './montecarlo.js';

function config(): CharacterConfig {
  const result = normalizeConfig(structuredClone(crossbowPreset) as unknown as CharacterConfig);
  result.attacks = result.attacks.slice(0, 2);
  result.attacks.forEach((attack) => {
    attack.weapon.damageDice = '1d1';
    attack.weapon.magicBonus = 0;
    attack.useAbilityMod = false;
  });
  result.proficiencyBonus = 0;
  result.abilityMod = 0;
  result.fightingStyle.bonus = 0;
  result.feats.sharpshooter = false;
  result.feats.gwm = false;
  result.feats.piercer.enabled = false;
  result.riders = [];
  result.critRange = 20;
  result.weaponMastery.vex = false;
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe('Elven Accuracy exact distribution', () => {
  it('normalizes max-of-three and has the expected mean and critical chance', () => {
    const dist = advantageDist(straightDist(false), 3);
    const total = dist.prob.reduce((sum, p) => sum + p, 0);
    const mean = dist.prob.reduce((sum, p, roll) => sum + p * roll, 0);

    expect(total).toBeCloseTo(1, 12);
    expect(mean).toBeCloseTo(15.4875, 12);
    expect(computeHitProbs(dist, 21, 20).crit).toBeCloseTo(1 - (19 / 20) ** 3, 12);
  });

  it('applies Halfling Lucky to each die before taking the maximum', () => {
    const base = straightDist(true);
    const dist = advantageDist(base, 3);

    expect(dist.prob[1]).toBeCloseTo((1 / 400) ** 3, 16);
    expect(dist.cdf[19]).toBeCloseTo(base.cdf[19] ** 3, 12);
    expect(dist.prob.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  });

  it('changes advantaged DPR only, including conditional Vex advantage', () => {
    const base = config();
    const normalWithout = calcExpectedDPR(base, 15);
    base.feats.elvenAccuracy = true;
    expect(calcExpectedDPR(base, 15)).toBeCloseTo(normalWithout, 12);

    base.feats.elvenAccuracy = false;
    const advantageWithout = calcExpectedDPR(base, 15, { forceAdvantageAll: true });
    base.feats.elvenAccuracy = true;
    expect(calcExpectedDPR(base, 15, { forceAdvantageAll: true })).toBeGreaterThan(advantageWithout);

    base.weaponMastery.vex = true;
    base.feats.elvenAccuracy = false;
    const vexWithout = calcExpectedDPR(base, 15);
    base.feats.elvenAccuracy = true;
    expect(calcExpectedDPR(base, 15)).toBeGreaterThan(vexWithout);
  });
});

describe('Elven Accuracy simulations', () => {
  it('uses a third roll for an advantaged round attack', () => {
    const base = config();
    base.attacks = base.attacks.slice(0, 1);
    base.feats.elvenAccuracy = true;
    vi.spyOn(Math, 'random').mockReturnValue(0)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.99);

    expect(simulateRound(base, { simCount: 1, targetAC: 30, forceAdvantageAll: true })).toEqual({
      totalDamage: 2,
      critCount: 1,
    });
  });

  it('uses a third roll in mook clearing', () => {
    const base = config();
    base.attacks = base.attacks.slice(0, 1);
    base.feats.elvenAccuracy = true;
    vi.spyOn(Math, 'random').mockReturnValue(0)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.99);

    const result = runMookSim(base, { simCount: 1, mookAC: 30, mookHP: 1, hasSurprise: true });
    expect(result.avgKills).toBe(1);
  });
});

describe('legacy config normalization', () => {
  it('defaults a missing Elven Accuracy field to false', () => {
    const legacy = config() as CharacterConfig & { feats: { elvenAccuracy?: boolean } };
    delete (legacy.feats as { elvenAccuracy?: boolean }).elvenAccuracy;
    expect(normalizeConfig(legacy as CharacterConfig).feats.elvenAccuracy).toBe(false);
  });
});
