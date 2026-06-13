// ============================================================
// DPR Curve Analysis
// ============================================================
import { calcDPRCurve } from '../engine/probability.js';
export function analyzeDPRCurve(config) {
    return calcDPRCurve(config);
}
export function buildDPRTable(result) {
    return result.acs.map((ac, idx) => {
        const dprs = result.scenarios.map(s => s.dprs[idx]);
        const maxDPR = Math.max(...dprs);
        return {
            ac,
            values: result.scenarios.map(s => ({
                label: s.label,
                dpr: s.dprs[idx],
                isBest: Math.abs(s.dprs[idx] - maxDPR) < 0.01,
            })),
        };
    });
}
