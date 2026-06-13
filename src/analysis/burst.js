// ============================================================
// Burst Distribution Analysis (wraps Monte Carlo results)
// ============================================================
/** Build percentile summary from MC result */
export function buildPercentileTable(_config, result) {
    return result.percentiles;
}
export function buildHistogramBins(histData, simCount, p50, p90) {
    if (histData.length === 0)
        return [];
    const maxDmg = Math.max(...histData.map(h => h.damage));
    const BIN_WIDTH = 5;
    const numBins = Math.ceil(maxDmg / BIN_WIDTH) + 1;
    const bins = new Array(numBins).fill(0);
    for (const { damage, count } of histData) {
        const binIdx = Math.floor(damage / BIN_WIDTH);
        if (binIdx < numBins)
            bins[binIdx] += count;
    }
    return bins.map((count, i) => {
        const lo = i * BIN_WIDTH;
        const hi = lo + BIN_WIDTH - 1;
        const midpoint = lo + Math.floor(BIN_WIDTH / 2);
        return {
            label: `${lo}-${hi}`,
            count: count / simCount, // normalize to probability
            isP50: Math.abs(midpoint - p50) < BIN_WIDTH,
            isP90: Math.abs(midpoint - p90) < BIN_WIDTH,
        };
    });
}
