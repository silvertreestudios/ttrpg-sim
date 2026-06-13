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
/** Build a straight d20 distribution */
export function straightDist(halflingLucky) {
    const prob = new Array(21).fill(0);
    if (!halflingLucky) {
        for (let k = 1; k <= 20; k++)
            prob[k] = 1 / 20;
    }
    else {
        prob[1] = 1 / 400;
        for (let k = 2; k <= 20; k++)
            prob[k] = 21 / 400;
    }
    const cdf = new Array(21).fill(0);
    cdf[0] = 0;
    for (let k = 1; k <= 20; k++)
        cdf[k] = cdf[k - 1] + prob[k];
    return { prob, cdf };
}
/** Build advantage distribution from a base straight dist */
export function advantageDist(base) {
    const prob = new Array(21).fill(0);
    // P(max = k) = CDF(k)^2 - CDF(k-1)^2
    for (let k = 1; k <= 20; k++) {
        prob[k] = base.cdf[k] * base.cdf[k] - base.cdf[k - 1] * base.cdf[k - 1];
    }
    const cdf = new Array(21).fill(0);
    cdf[0] = 0;
    for (let k = 1; k <= 20; k++)
        cdf[k] = cdf[k - 1] + prob[k];
    return { prob, cdf };
}
/** Build disadvantage distribution from a base straight dist */
export function disadvantageDist(base) {
    const prob = new Array(21).fill(0);
    // P(min = k) = (1 - CDF(k-1))^2 - (1 - CDF(k))^2
    for (let k = 1; k <= 20; k++) {
        const pGtePrev = 1 - base.cdf[k - 1];
        const pGte = 1 - base.cdf[k];
        prob[k] = pGtePrev * pGtePrev - pGte * pGte;
    }
    const cdf = new Array(21).fill(0);
    cdf[0] = 0;
    for (let k = 1; k <= 20; k++)
        cdf[k] = cdf[k - 1] + prob[k];
    return { prob, cdf };
}
/** Get the distribution for a given advantage state and halfling lucky setting */
export function getD20Dist(advState, halflingLucky) {
    const base = straightDist(halflingLucky);
    if (advState === 'normal')
        return base;
    if (advState === 'advantage')
        return advantageDist(base);
    return disadvantageDist(base);
}
export function computeHitProbs(dist, needed, // AC - hitBonus, already computed
critRange) {
    let miss = 0;
    let hit = 0;
    let crit = 0;
    for (let k = 1; k <= 20; k++) {
        const p = dist.prob[k];
        if (k === 1) {
            // Nat 1 always misses, even with advantage distribution
            miss += p;
        }
        else if (k >= critRange) {
            // Nat 20 (or expanded crit range) always crits
            crit += p;
        }
        else if (k >= needed) {
            hit += p;
        }
        else {
            miss += p;
        }
    }
    return { miss, hit, crit };
}
