// ============================================================
// Mook Clearing Analysis
// ============================================================
// Uses Monte Carlo simulation via the worker.
export const MOOK_PRESETS = [
    { label: 'Minion (CR ½)', ac: 13, hp: 20, cr: 'CR ½' },
    { label: 'Light (CR 1)', ac: 13, hp: 25, cr: 'CR 1' },
    { label: 'Standard (CR 2)', ac: 14, hp: 35, cr: 'CR 2' },
    { label: 'Tough (CR 3)', ac: 14, hp: 45, cr: 'CR 3' },
    { label: 'Brute (CR 3-4)', ac: 15, hp: 55, cr: 'CR 3-4' },
    { label: 'Elite (CR 4-5)', ac: 15, hp: 65, cr: 'CR 4-5' },
];
export function buildMookDisplay(result) {
    const killDistRows = result.killDistribution.map((prob, kills) => ({ kills, prob }));
    return {
        avgKills: result.avgKills,
        killDistRows,
        avgBoltsPerKill: result.avgBoltsPerKill,
        overkillPct: result.overkillTax * 100,
    };
}
