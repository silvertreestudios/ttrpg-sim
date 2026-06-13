// ============================================================
// Dice Utilities
// ============================================================
export function parseDice(expr) {
    if (!expr || expr.trim() === '')
        return { numDice: 0, sides: 0, flat: 0 };
    const str = expr.trim().toLowerCase();
    // Match patterns like: 2d6+3, 1d8, 3d4-1, d6, 5
    const match = str.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
    if (match) {
        const numDice = match[1] ? parseInt(match[1]) : 1;
        const sides = parseInt(match[2]);
        const flat = match[3] ? parseInt(match[3]) : 0;
        return { numDice, sides, flat };
    }
    // Pure flat number
    const flatOnly = parseInt(str);
    if (!isNaN(flatOnly))
        return { numDice: 0, sides: 0, flat: flatOnly };
    console.warn(`Could not parse dice expression: ${expr}`);
    return { numDice: 0, sides: 0, flat: 0 };
}
/** Expected value of a dice expression */
export function diceExpectedValue(expr) {
    const { numDice, sides, flat } = parseDice(expr);
    if (sides === 0)
        return flat;
    return numDice * (sides + 1) / 2 + flat;
}
/** Expected value when the dice portion is doubled (crit) plus flat */
export function critExpectedValue(expr) {
    const { numDice, sides, flat } = parseDice(expr);
    if (sides === 0)
        return flat; // flat damage doesn't double
    return 2 * numDice * (sides + 1) / 2 + flat;
}
/** Roll a single die (sides-sided) */
export function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
}
/** Roll numDice dice of 'sides' sides and return total */
export function rollDice(numDice, sides) {
    let total = 0;
    for (let i = 0; i < numDice; i++) {
        total += rollDie(sides);
    }
    return total;
}
/** Roll and sum a dice expression */
export function rollExpr(expr) {
    const { numDice, sides, flat } = parseDice(expr);
    if (sides === 0)
        return flat;
    return rollDice(numDice, sides) + flat;
}
/** Roll expression, doubled dice (crit) */
export function rollExprCrit(expr) {
    const { numDice, sides, flat } = parseDice(expr);
    if (sides === 0)
        return flat;
    return rollDice(numDice * 2, sides) + flat;
}
/** Roll d20 with Halfling Lucky (reroll nat 1s, keep reroll) */
export function rollD20HalflingLucky() {
    const r = rollDie(20);
    if (r === 1)
        return rollDie(20); // reroll once, keep result
    return r;
}
/** Roll d20 with advantage (two dice, take max), optionally Halfling Lucky */
export function rollD20Advantage(halflingLucky) {
    const r1 = halflingLucky ? rollD20HalflingLucky() : rollDie(20);
    const r2 = halflingLucky ? rollD20HalflingLucky() : rollDie(20);
    return Math.max(r1, r2);
}
/** Roll d20 straight, optionally Halfling Lucky */
export function rollD20(halflingLucky) {
    return halflingLucky ? rollD20HalflingLucky() : rollDie(20);
}
