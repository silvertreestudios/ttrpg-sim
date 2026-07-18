// ============================================================
// Halfling Lucky d20 Distribution
// ============================================================
// Without Halfling Lucky: P(k) = 1/20 for k = 1..20
// With Halfling Lucky: nat 1 is rerolled once (keep result)
//   P(1)  = P(roll 1) * P(reroll 1) = (1/20)*(1/20) = 1/400
//   P(k)  = P(roll k) + P(roll 1) * P(reroll k) for k = 2..20
//         = 1/20 + (1/20)*(1/20) = 21/400 for k = 2..20
//
// Advantage (2 dice, take max):
//   P(max = k) = F(k)^2 - F(k-1)^2 where F(k) = CDF(k)
// ============================================================

export interface D20Dist {
  /** prob[k] = probability of rolling exactly k, for k=1..20 (indices 1-20 used, 0 unused) */
  prob: number[];
  /** cdf[k] = P(roll <= k) */
  cdf: number[];
}

/** Build a straight d20 distribution */
export function straightDist(halflingLucky: boolean): D20Dist {
  const prob = new Array(21).fill(0);
  if (!halflingLucky) {
    for (let k = 1; k <= 20; k++) prob[k] = 1 / 20;
  } else {
    prob[1] = 1 / 400;
    for (let k = 2; k <= 20; k++) prob[k] = 21 / 400;
  }

  const cdf = new Array(21).fill(0);
  cdf[0] = 0;
  for (let k = 1; k <= 20; k++) cdf[k] = cdf[k - 1] + prob[k];

  return { prob, cdf };
}

/** Build a take-the-highest distribution from a base straight dist. */
export function advantageDist(base: D20Dist, rollCount = 2): D20Dist {
  const prob = new Array(21).fill(0);
  // P(max = k) = CDF(k)^n - CDF(k-1)^n
  for (let k = 1; k <= 20; k++) {
    prob[k] = Math.pow(base.cdf[k], rollCount) - Math.pow(base.cdf[k - 1], rollCount);
  }

  const cdf = new Array(21).fill(0);
  cdf[0] = 0;
  for (let k = 1; k <= 20; k++) cdf[k] = cdf[k - 1] + prob[k];

  return { prob, cdf };
}

/** Build disadvantage distribution from a base straight dist */
export function disadvantageDist(base: D20Dist): D20Dist {
  const prob = new Array(21).fill(0);
  // P(min = k) = (1 - CDF(k-1))^2 - (1 - CDF(k))^2
  for (let k = 1; k <= 20; k++) {
    const pGtePrev = 1 - base.cdf[k - 1];
    const pGte = 1 - base.cdf[k];
    prob[k] = pGtePrev * pGtePrev - pGte * pGte;
  }

  const cdf = new Array(21).fill(0);
  cdf[0] = 0;
  for (let k = 1; k <= 20; k++) cdf[k] = cdf[k - 1] + prob[k];

  return { prob, cdf };
}

export type AdvantageState = 'normal' | 'advantage' | 'disadvantage';

/** Get the distribution for a given advantage state and halfling lucky setting */
export function getD20Dist(advState: AdvantageState, halflingLucky: boolean, elvenAccuracy = false): D20Dist {
  const base = straightDist(halflingLucky);
  if (advState === 'normal') return base;
  if (advState === 'advantage') return advantageDist(base, elvenAccuracy ? 3 : 2);
  return disadvantageDist(base);
}

/**
 * Compute hit/crit/miss probabilities for a given d20 distribution
 * against a target (need to roll >= needed on d20).
 *
 * Rules:
 * - Nat 1 always misses
 * - Nat >= critRange always crits (and hits)
 * - Otherwise: roll + hitBonus >= AC to hit
 *
 * hitBonus = prof + abilMod + magicBonus + fightingStyle - SSpenalty
 * needed = AC - hitBonus (the raw d20 value needed)
 */
export interface HitCritMiss {
  miss: number;
  hit: number;   // normal hit (not crit)
  crit: number;
}

export function computeHitProbs(
  dist: D20Dist,
  needed: number,  // AC - hitBonus, already computed
  critRange: number, // 18, 19, or 20
): HitCritMiss {
  let miss = 0;
  let hit = 0;
  let crit = 0;

  for (let k = 1; k <= 20; k++) {
    const p = dist.prob[k];
    if (k === 1) {
      // Nat 1 always misses, even with advantage distribution
      miss += p;
    } else if (k >= critRange) {
      // Nat 20 (or expanded crit range) always crits
      crit += p;
    } else if (k >= needed) {
      hit += p;
    } else {
      miss += p;
    }
  }

  return { miss, hit, crit };
}
