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
import { parseDice, diceExpectedValue, critExpectedValue } from './dice.js';
import { computeHitProbs, straightDist, advantageDist, } from './halfling-lucky.js';
/** Full expected DPR for a character config vs a given AC */
export function calcExpectedDPR(config, ac, opts = {}) {
    const { overrideSS = null, skipSSAtk1 = false, forceAdvantageAtk1 = false, forceAdvantageAll = false, hexActive = false, } = opts;
    const hl = config.feats.halflingLucky;
    const critRange = config.critRange;
    const prof = config.proficiencyBonus;
    const abilMod = config.abilityMod;
    const fightingBonus = config.fightingStyle.bonus;
    // Compute expected damage per attack, accounting for Vex chaining
    // Vex: if an attack HITS (not misses), next attack has advantage.
    // We model this as a probability tree:
    //   State before attack i: P(has_advantage)
    //   After attack i hits: next gets advantage
    //   After attack i misses/crits (crit is also a hit): next gets advantage
    const attacks = [...config.attacks].sort((a, b) => a.order - b.order);
    const vexEnabled = config.weaponMastery.vex;
    // We track P(advantage going into attack i) via a probability-weighted sum.
    // Because we need to handle the Vex chain, we'll use expected hit rates.
    // P(adv_i) for attack i:
    //   Atk 1: forced by surprise/lucky/flanking, else no advantage initially
    //   Atk i+1: P(adv) = P(Atk i hit or crit) if vex enabled, else 0
    // We'll compute iteratively, tracking "expected advantage probability"
    // This is an approximation for the conditional — we use the average P(hit)
    // from the previous attack's distribution to seed the next.
    let pAdvantageForNext = 0; // starts as 0 (no advantage on Atk1 unless forced)
    // Override: check for forced advantages
    if (forceAdvantageAll)
        pAdvantageForNext = 1;
    else if (forceAdvantageAtk1)
        pAdvantageForNext = 1;
    let totalEV = 0;
    // Track if any attack was a Pact Weapon hit (for Thirsting Blade)
    // For exact calc, we compute probability of "first pact weapon hit" occurring
    let pFirstPactHitUsed = 0; // probability that Thirsting Blade has already fired
    // For "first hit per turn" riders
    let pFirstHitUsed = 0;
    for (let i = 0; i < attacks.length; i++) {
        const atk = attacks[i];
        // Determine advantage state for this attack
        let advState = 'normal';
        if (forceAdvantageAll) {
            advState = 'advantage';
        }
        else if (i === 0 && (forceAdvantageAtk1) && !forceAdvantageAll) {
            advState = 'advantage';
            pAdvantageForNext = 0; // reset after atk1 forced
        }
        else if (vexEnabled && pAdvantageForNext > 0) {
            // Vex chain: we blend advantage and normal distributions
            // EV(damage) = pAdv * EV(damage | adv) + (1 - pAdv) * EV(damage | normal)
            // We'll compute both and blend
        }
        // Determine SS usage for this attack
        let useSS = false;
        if (overrideSS === true)
            useSS = true;
        else if (overrideSS === false)
            useSS = false;
        else if (skipSSAtk1 && i === 0)
            useSS = false;
        else
            useSS = config.feats.sharpshooter || config.feats.gwm;
        // Compute hit bonus
        const magicBonus = atk.weapon.magicBonus;
        let hitBonus = prof + fightingBonus + magicBonus;
        if (atk.useAbilityMod)
            hitBonus += abilMod;
        if (useSS)
            hitBonus -= 5; // Sharpshooter penalty
        // Needed roll on d20
        const needed = ac - hitBonus;
        // Get distributions
        const baseDist = straightDist(hl);
        const advDistObj = advantageDist(baseDist);
        let hcmNormal;
        let hcmAdv;
        if (needed <= 1) {
            // Always hits (or crits) on any roll except nat 1 handled inside
            hcmNormal = computeHitProbs(baseDist, needed, critRange);
            hcmAdv = computeHitProbs(advDistObj, needed, critRange);
        }
        else {
            hcmNormal = computeHitProbs(baseDist, needed, critRange);
            hcmAdv = computeHitProbs(advDistObj, needed, critRange);
        }
        // Override for i === 0 with forced advantage
        if (forceAdvantageAtk1 && i === 0 && !forceAdvantageAll) {
            advState = 'advantage';
        }
        // Blend hit probabilities based on Vex advantage probability
        let hcm;
        if (forceAdvantageAll || (forceAdvantageAtk1 && i === 0)) {
            hcm = hcmAdv;
        }
        else if (vexEnabled && pAdvantageForNext > 0 && pAdvantageForNext < 1) {
            // Blend
            hcm = {
                miss: pAdvantageForNext * hcmAdv.miss + (1 - pAdvantageForNext) * hcmNormal.miss,
                hit: pAdvantageForNext * hcmAdv.hit + (1 - pAdvantageForNext) * hcmNormal.hit,
                crit: pAdvantageForNext * hcmAdv.crit + (1 - pAdvantageForNext) * hcmNormal.crit,
            };
        }
        else if (vexEnabled && pAdvantageForNext >= 1) {
            hcm = hcmAdv;
        }
        else {
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
            if (!rider.enabled)
                continue;
            const riderEV = computeRiderEV(rider, hcm, pFirstHitUsed, pFirstPactHitUsed, atk, hexActive, i, config);
            attackEV += riderEV;
        }
        totalEV += attackEV;
        // Update Vex chain probability for next attack
        // Vex triggers on a HIT (hit or crit)
        if (vexEnabled) {
            pAdvantageForNext = pHit; // P(this attack hit) = P(next has advantage)
        }
        else {
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
function computeRiderEV(rider, hcm, pFirstHitUsed, pFirstPactHitUsed, atk, hexActive, attackIndex, _config) {
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
            if (!atk.isPactWeapon)
                return 0;
            pTrigger = (1 - pFirstPactHitUsed) * hcm.hit;
            pTriggerCrit = (1 - pFirstPactHitUsed) * hcm.crit;
            break;
        case 'onCritPactWeaponOnly':
            if (!atk.isPactWeapon)
                return 0;
            pTrigger = 0;
            pTriggerCrit = pCrit;
            break;
        case 'onCritAnyWeapon':
            pTrigger = 0;
            pTriggerCrit = pCrit;
            break;
        case 'onHitWhileActive':
            if (!hexActive)
                return 0;
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
export function calcDPRCurve(config) {
    const acs = Array.from({ length: 16 }, (_, i) => i + 10); // AC 10-25
    const hasSS = config.feats.sharpshooter || config.feats.gwm;
    const scenarios = [];
    // All SS (if feat enabled)
    if (hasSS) {
        scenarios.push({
            label: 'All Sharpshooter',
            color: '#f59e0b',
            dprs: acs.map(ac => calcExpectedDPR(config, ac, { overrideSS: true })),
        });
    }
    // Skip SS on Atk1
    if (hasSS) {
        scenarios.push({
            label: 'Skip SS Atk 1',
            color: '#10b981',
            dprs: acs.map(ac => calcExpectedDPR(config, ac, { skipSSAtk1: true })),
        });
    }
    // No SS
    scenarios.push({
        label: 'No Sharpshooter',
        color: '#6366f1',
        dprs: acs.map(ac => calcExpectedDPR(config, ac, { overrideSS: false })),
    });
    // With Lucky (advantage on Atk1) + All SS
    if (config.feats.lucky.enabled && hasSS) {
        scenarios.push({
            label: 'Lucky + All SS',
            color: '#ec4899',
            dprs: acs.map(ac => calcExpectedDPR(config, ac, {
                overrideSS: true,
                forceAdvantageAtk1: true,
            })),
        });
    }
    // With Hex active
    const hasHex = config.riders.some(r => r.condition === 'onHitWhileActive');
    if (hasHex) {
        scenarios.push({
            label: hasSS ? 'All SS + Hex' : 'With Hex',
            color: '#8b5cf6',
            dprs: acs.map(ac => calcExpectedDPR(config, ac, {
                overrideSS: hasSS ? true : null,
                hexActive: true,
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
                if (allSSScenario.dprs[i] >= skipScenario.dprs[i] &&
                    allSSScenario.dprs[i + 1] < skipScenario.dprs[i + 1]) {
                    allSSvsSkip = acs[i + 1];
                    break;
                }
            }
        }
        if (skipScenario && noSSScenario) {
            for (let i = 0; i < acs.length - 1; i++) {
                if (skipScenario.dprs[i] >= noSSScenario.dprs[i] &&
                    skipScenario.dprs[i + 1] < noSSScenario.dprs[i + 1]) {
                    skipSSvsNoSS = acs[i + 1];
                    break;
                }
            }
        }
    }
    return { acs, scenarios, breakpoints: { allSSvsSkip, skipSSvsNoSS } };
}
