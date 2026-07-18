import type { CharacterConfig } from './types.js';

/** Fill fields introduced after older saved/exported configs were created. */
export function normalizeConfig(config: CharacterConfig): CharacterConfig {
  return {
    ...config,
    feats: {
      ...config.feats,
      elvenAccuracy: config.feats.elvenAccuracy ?? false,
    },
    attacks: config.attacks.map(a => Object.assign({ useSharpshooter: true }, a)),
    riders: (config.riders ?? []).map(r => Object.assign(
      { enabled: true, placement: 'firstAvailable' as const, requiresBonusAction: false, perTurnLimit: 0 },
      r,
    )),
    advantageSources: config.advantageSources ?? {
      surprise: false,
      luckyOnAtk1: false,
      flanking: false,
    },
    weaponMastery: config.weaponMastery ?? { vex: false },
    actionSurge: config.actionSurge ?? {
      enabled: false,
      extraAttacks: [],
      usesPerRest: 1,
    },
  };
}
