// ============================================================
// D&D 5.5e DPR Calculator — Core Types
// ============================================================

export interface WeaponConfig {
  damageDice: string;   // e.g. "1d6", "1d8", "2d6"
  magicBonus: number;   // +0, +1, +2, +3
}

export interface AttackConfig {
  name: string;
  weapon: WeaponConfig;
  isPactWeapon: boolean;
  useAbilityMod: boolean;
  useSharpshooter: boolean;  // override per-attack SS toggle
  order: number;             // 1-indexed, determines Vex chain position
}

export interface PiercerConfig {
  enabled: boolean;
  die: string;           // e.g. "1d6" — extra die on crit
  doublesOnCrit: boolean; // always false for Piercer — extra die, not doubled
  puncture: boolean;     // Puncture: once/turn, reroll one weapon damage die on 1
  punctureDie: number;   // sides of the weapon die to reroll (e.g. 6 for d6)
}

export interface LuckyConfig {
  enabled: boolean;
  points: number;
}

export interface FeatsConfig {
  sharpshooter: boolean;
  gwm: boolean;
  piercer: PiercerConfig;
  lucky: LuckyConfig;
  halflingLucky: boolean;
  crossbowExpert: boolean;
}

export type RiderCondition =
  | 'onEveryHit'
  | 'firstHitPerTurn'
  | 'firstHitPactWeapon'
  | 'onCritPactWeaponOnly'
  | 'onCritAnyWeapon'
  | 'onHitWhileActive';

export type RiderPlacement =
  | 'firstAvailable'
  | 'preferSecondAttack'
  | 'onlyCrit';

export interface RiderConfig {
  name: string;
  damage: string;          // e.g. "1d6", "5d8", "2d6+3"
  doublesOnCrit: boolean;
  condition: RiderCondition;
  placement: RiderPlacement;
  requiresBonusAction: boolean;
  perTurnLimit: number;    // 0 = unlimited
  enabled: boolean;
}

export interface WeaponMasteryConfig {
  vex: boolean;
}

export interface AdvantageSourcesConfig {
  surprise: boolean;       // Atk 1 has advantage from surprise
  luckyOnAtk1: boolean;    // Spend lucky point for advantage on Atk1
  flanking: boolean;       // All attacks have advantage
}

export interface FightingStyleConfig {
  type: string;
  bonus: number;
}

export interface ActionSurgeConfig {
  enabled: boolean;
  extraAttacks: AttackConfig[];  // The additional attacks granted by Action Surge
  usesPerRest: number;           // 1 at levels 2-16, 2 at level 17+
}

export interface CharacterConfig {
  name: string;
  level: number;
  proficiencyBonus: number;
  abilityMod: number;
  fightingStyle: FightingStyleConfig;
  critRange: number;       // lowest d20 value that crits (20, 19, 18)
  attacks: AttackConfig[];
  feats: FeatsConfig;
  weaponMastery: WeaponMasteryConfig;
  riders: RiderConfig[];
  advantageSources: AdvantageSourcesConfig;
  actionSurge: ActionSurgeConfig;
}

// ============================================================
// Probability / Math types
// ============================================================

export interface D20Distribution {
  // prob[k] = P(d20 roll = k) for k = 1..20
  prob: Float64Array;
}

export interface HitResult {
  miss: number;
  hit: number;
  crit: number;
}

export interface AttackStats {
  hitBonus: number;
  damageDice: string;
  flatDamage: number;
  advantageState: 'normal' | 'advantage' | 'disadvantage';
  useSS: boolean;
  isPactWeapon: boolean;
  useAbilityMod: boolean;
}

// ============================================================
// Analysis result types
// ============================================================

export interface DPRTableRow {
  ac: number;
  allSS: number;
  skipSS1: number;
  noSS: number;
  withLucky: number;
  best: string;
}

export interface BurstPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  whiffRate: number;
  killProbs: { hp: number; prob: number }[];
}

export interface HexRow {
  rounds: number;       // reapplication interval
  avgDPR: number;
  vsBenchmark: number;
}

export interface MookResult {
  ac: number;
  hp: number;
  avgKills: number;
  killDist: number[];   // P(0 kills), P(1 kill), P(2 kills), ...
  boltsPerKill: number;
  overkillPct: number;
}

export interface SurpriseRow {
  ac: number;
  surpriseDPR: number;
  surpriseHexDPR: number;
  normalDPR: number;
  delta: number;
}

// ============================================================
// Worker message types
// ============================================================

export interface WorkerRequest {
  type: 'montecarlo' | 'mooksim';
  config: CharacterConfig;
  targetAC: number;
  simCount: number;
  mookHP?: number;
  mookAC?: number;
  hasSurprise?: boolean;
  useActionSurge?: boolean;
}

export interface WorkerProgress {
  type: 'progress';
  pct: number;
}

export interface WorkerResult {
  type: 'result';
  resultType: 'montecarlo' | 'mooksim';
  data: MonteCarloResult | MookSimResult;
}

export interface MonteCarloResult {
  histogram: { damage: number; count: number }[];
  percentiles: BurstPercentiles;
  critRounds: {
    noCrit: { freq: number; avg: number };
    singleCrit: { freq: number; avg: number };
    doubleCrit: { freq: number; avg: number };
  };
}

export interface MookSimResult {
  avgKills: number;
  killDistribution: number[];  // prob[k] = P(killed exactly k mooks)
  avgBoltsPerKill: number;
  overkillTax: number;
  killsByRound?: { round: number; avgKills: number }[];
  simCount?: number;
}
