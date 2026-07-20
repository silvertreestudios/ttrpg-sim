// ============================================================
// Main Entry Point — D&D 5.5e DPR Calculator
// ============================================================

import './style.css';
import type { CharacterConfig } from './types.js';
import { initSidebar, updateSidebarConfig } from './ui/sidebar.js';
import { initTabs, type TabId } from './ui/tabs.js';
import { renderLineChart, renderBarChart, renderGroupedBar, renderCDFChart } from './ui/charts.js';
import { renderDPRTable, renderTable, fmtDec, fmtSigned } from './ui/tables.js';
import { analyzeDPRCurve } from './analysis/dpr-curve.js';
import { buildHistogramBins } from './analysis/burst.js';
import { analyzeHex } from './analysis/hex.js';
import { analyzeSurprise } from './analysis/surprise.js';
import type { WorkerRequest, WorkerProgress, WorkerResult, MonteCarloResult, MookSimResult } from './types.js';

import crossbowPreset from './presets/crossbow-champion.json';
import berserkerPreset from './presets/berserker-gwm-pam.json';
import vengPaladinPreset from './presets/vengeance-paladin-smite.json';
import shadowMonkPreset from './presets/shadow-monk-nick-flurry.json';

// ============================================================
// Presets map  (key matches <option value="..."> in index.html)
// ============================================================

const PRESETS: Record<string, CharacterConfig> = {
  'crossbow-champion': crossbowPreset as unknown as CharacterConfig,
  'berserker-gwm-pam': berserkerPreset as unknown as CharacterConfig,
  'vengeance-paladin-smite': vengPaladinPreset as unknown as CharacterConfig,
  'shadow-monk-nick-flurry': shadowMonkPreset as unknown as CharacterConfig,
};

// ============================================================
// State
// ============================================================

/** Whether the config was loaded from localStorage (= "Custom") or the default preset. */
let configFromLocalStorage = !!localStorage.getItem('dnd-dpr-config');

let config: CharacterConfig = loadConfig();

// ============================================================
// Worker management
// ============================================================

let mcWorker: Worker | null = null;
let mookWorker: Worker | null = null;

// ============================================================
// Cached MC results (for CDF toggle re-render without re-sim)
// ============================================================

/** Last single-run MC result — used to re-render when toggling PDF/CDF */
let lastMCResult: MonteCarloResult | null = null;
/** Sim count that produced lastMCResult */
let lastMCSimCount = 100000;

function createWorker(): Worker {
  return new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
}

// ============================================================
// Config persistence
// ============================================================

function loadConfig(): CharacterConfig {
  const saved = localStorage.getItem('dnd-dpr-config');
  if (saved) {
    try {
      return JSON.parse(saved) as CharacterConfig;
    } catch {
      // fall through to preset
    }
  }
  return applyPreset(PRESETS['crossbow-champion']);
}

function applyPreset(preset: CharacterConfig): CharacterConfig {
  // Ensure all required fields have defaults
  return {
    ...preset,
    feats: { ...preset.feats, elvenAccuracy: preset.feats.elvenAccuracy ?? false },
    attacks: preset.attacks.map(a => Object.assign(
      { useSharpshooter: true },
      a,
    )),
    riders: (preset.riders ?? []).map(r => Object.assign(
      { enabled: true, placement: 'firstAvailable' as const, requiresBonusAction: false, perTurnLimit: 0 },
      r,
    )),
    advantageSources: preset.advantageSources ?? {
      surprise: false,
      luckyOnAtk1: false,
      flanking: false,
    },
    weaponMastery: preset.weaponMastery ?? { vex: false },
    actionSurge: preset.actionSurge ?? {
      enabled: false,
      extraAttacks: [],
      usesPerRest: 1,
    },
  };
}

// ============================================================
// Analysis rendering
// ============================================================

function renderDPRCurveTab(): void {
  const result = analyzeDPRCurve(config);

  renderLineChart(
    'chart-dpr',
    result.acs,
    result.scenarios,
    'Average DPR',
    'Target AC',
  );

  renderDPRTable(
    'table-dpr',
    result.acs,
    result.scenarios,
    result.breakpoints,
  );

  // Show/hide the Action Surge comparison panel in burst tab
  const surgeCompareEl = document.getElementById('actionsurge-comparison');
  if (surgeCompareEl) {
    surgeCompareEl.style.display =
      (config.actionSurge?.enabled && config.actionSurge.extraAttacks.length > 0)
        ? '' : 'none';
  }
}

function renderHexTab(): void {
  const acInput = document.getElementById('hex-ac') as HTMLInputElement;
  const ac = parseInt(acInput?.value ?? '16') || 16;

  const result = analyzeHex(config, ac);

  // Bar chart — DPR comparison
  renderBarChart(
    'chart-hex',
    result.scenarios.map(s => s.label),
    [{
      label: 'DPR',
      data: result.scenarios.map(s => s.dpr),
      color: '#6366f1',
    }],
    'DPR',
    'Scenario',
  );

  // Amortized table
  if (result.amortizedTable.length > 0) {
    renderTable(
      'table-hex',
      [
        {
          key: 'rounds',
          header: 'Rounds on Target',
          render: (r) => r.roundsOnTarget === 999 ? '∞ (never reapply)' : r.roundsOnTarget,
          alignRight: true,
        },
        {
          key: 'dpr',
          header: 'Avg DPR/round',
          render: (r) => r.amortizedDPR,
          format: fmtDec(1),
          alignRight: true,
        },
        {
          key: 'vs',
          header: 'vs No Spell',
          render: (r) => r.vsBenchmark,
          format: fmtSigned(1),
          highlight: (r) => r.worth,
          alignRight: true,
        },
        {
          key: 'verdict',
          header: 'Verdict',
          render: (r) => r.worth ? '✓ Worth it' : '✗ Skip',
        },
      ],
      result.amortizedTable,
      `Hex/Concentration break-even (AC ${ac}): ${result.breakEvenRounds ? `worth it if target lives ${result.breakEvenRounds}+ rounds` : 'No spell rider configured'}`,
    );
  } else {
    const el = document.getElementById('table-hex');
    if (el) el.innerHTML = '<p class="muted">No concentration spell rider configured. Add a rider with "On hit while active" trigger.</p>';
  }
}

function renderSurpriseTab(): void {
  const result = analyzeSurprise(config);

  renderLineChart(
    'chart-surprise',
    result.acs,
    result.scenarios,
    'DPR',
    'Target AC',
  );

  // 3-round table
  renderTable(
    'table-surprise',
    [
      { key: 'strategy', header: 'Strategy', render: (r) => r.strategy },
      { key: 'rnd1', header: 'Rnd 1', render: (r) => r.rnd1, format: fmtDec(1), alignRight: true },
      { key: 'rnd2', header: 'Rnd 2', render: (r) => r.rnd2, format: fmtDec(1), alignRight: true },
      { key: 'rnd3', header: 'Rnd 3', render: (r) => r.rnd3, format: fmtDec(1), alignRight: true },
      { key: 'total', header: '3-Rnd Total', render: (r) => r.total, format: fmtDec(1),
        highlight: (r, rows) => r.total === Math.max(...rows.map(x => x.total)),
        alignRight: true },
      { key: 'avg', header: 'Avg/Rnd', render: (r) => r.avgPerRound, format: fmtDec(1), alignRight: true },
    ],
    result.threeRoundTable,
    '3-Round Comparison (AC 16)',
  );
}

// ============================================================
// CDF / PDF rendering helpers
// ============================================================

/**
 * Given an array of per-bin probabilities (PDF), compute the survival function
 * (complementary CDF): P(damage >= X) for each bin.
 *
 * We treat each bin as representing one group of damage values, so "P(damage >= bin[i])"
 * is the sum of all probabilities at bin[i] and beyond.
 */
function buildCDFValues(pdfValues: number[]): number[] {
  const cdf: number[] = new Array(pdfValues.length).fill(0);
  let cumFromRight = 0;
  for (let i = pdfValues.length - 1; i >= 0; i--) {
    cumFromRight += pdfValues[i];
    cdf[i] = Math.min(cumFromRight, 1);  // clamp floating-point noise
  }
  return cdf;
}

/**
 * (Re-)render the main burst chart in PDF or CDF mode from a cached MC result.
 * Also shows/hides the CDF toggle label.
 */
function renderBurstChart(result: MonteCarloResult, simCount: number): void {
  const isCDF = (document.getElementById('burst-cumulative') as HTMLInputElement)?.checked ?? false;

  const bins = buildHistogramBins(
    result.histogram as unknown as { damage: number; count: number }[],
    simCount,
    result.percentiles.p50,
    result.percentiles.p90,
  );

  const labels = bins.map(b => b.label);
  const pdfValues = bins.map(b => b.count);

  if (isCDF) {
    const cdfValues = buildCDFValues(pdfValues);
    renderCDFChart(
      'chart-burst',
      labels,
      [{ label: 'P(damage ≥ X)', data: cdfValues, color: '#6366f1' }],
      'P(damage ≥ X)',
      'Damage (grouped)',
    );
  } else {
    renderBarChart(
      'chart-burst',
      labels,
      [{ label: 'Probability', data: pdfValues, color: '#6366f1' }],
      'Probability',
      'Damage (grouped)',
    );
  }
}

/**
 * (Re-)render the comparison burst chart (Normal vs Action Surge) in PDF or CDF mode.
 */
function renderCompareBurstChart(normal: MonteCarloResult, surge: MonteCarloResult, simCount: number): void {
  const isCDF = (document.getElementById('burst-cumulative') as HTMLInputElement)?.checked ?? false;

  const normalBins = buildHistogramBins(
    normal.histogram as unknown as { damage: number; count: number }[],
    simCount, normal.percentiles.p50, normal.percentiles.p90,
  );
  const surgeBins = buildHistogramBins(
    surge.histogram as unknown as { damage: number; count: number }[],
    simCount, surge.percentiles.p50, surge.percentiles.p90,
  );

  const maxLen = Math.max(normalBins.length, surgeBins.length);
  const labels = Array.from({ length: maxLen }, (_, i) =>
    normalBins[i]?.label ?? surgeBins[i]?.label ?? `${i * 5}-${i * 5 + 4}`);
  const normalData = Array.from({ length: maxLen }, (_, i) => normalBins[i]?.count ?? 0);
  const surgeData = Array.from({ length: maxLen }, (_, i) => surgeBins[i]?.count ?? 0);

  if (isCDF) {
    renderCDFChart(
      'chart-burst-compare',
      labels,
      [
        { label: 'Normal Round', data: buildCDFValues(normalData), color: '#6366f1' },
        { label: 'Action Surge', data: buildCDFValues(surgeData), color: '#ef4444' },
      ],
      'P(damage ≥ X)',
      'Damage',
    );
  } else {
    renderGroupedBar(
      'chart-burst-compare',
      labels,
      [
        { label: 'Normal Round', data: normalData, color: '#6366f1' },
        { label: 'Action Surge Round', data: surgeData, color: '#ef4444' },
      ],
      'Probability',
      'Damage',
    );
  }
}

function renderMCResult(result: MonteCarloResult): void {
  const simCount = (document.getElementById('sim-count') as HTMLSelectElement)?.value ?? '100000';
  const n = parseInt(simCount);

  // Cache for toggle re-render
  lastMCResult = result;
  lastMCSimCount = n;

  // Show the CDF toggle now that we have data
  const toggleLabel = document.getElementById('burst-cdf-toggle-label');
  if (toggleLabel) toggleLabel.style.display = '';

  // Histogram (PDF or CDF depending on toggle)
  renderBurstChart(result, n);

  // Percentile table
  const pct = result.percentiles;
  const tableData = [
    { label: 'Average', value: pct.avg, note: 'Expected DPR' },
    { label: 'Median (P50)', value: pct.p50, note: 'Typical round' },
    { label: 'P10', value: pct.p10, note: 'Bad round' },
    { label: 'P25', value: pct.p25, note: 'Below average' },
    { label: 'P75', value: pct.p75, note: 'Good round' },
    { label: 'P90', value: pct.p90, note: 'Crit round' },
    { label: 'P95', value: pct.p95, note: 'Hot crit round' },
    { label: 'P99', value: pct.p99, note: 'Nova' },
    { label: 'Max', value: pct.max, note: 'Theoretical ceiling' },
    { label: 'Whiff (0 dmg)', value: pct.whiffRate, note: 'Miss everything', isPct: true },
  ];

  let html = `
    <div class="burst-stats">
      <div class="stat-grid">
  `;
  for (const row of tableData) {
    const dispVal = row.isPct
      ? `${(Number(row.value) * 100).toFixed(1)}%`
      : Number(row.value).toFixed(1);
    html += `
      <div class="stat-card">
        <div class="stat-label">${row.label}</div>
        <div class="stat-value">${dispVal}</div>
        <div class="stat-note">${row.note}</div>
      </div>
    `;
  }
  html += `</div>`;

  // Crit breakdown
  const cr = result.critRounds;
  html += `
    <h3>Round Type Breakdown</h3>
    <table class="data-table">
      <thead><tr><th>Round Type</th><th class="text-right">Frequency</th><th class="text-right">Avg Damage</th></tr></thead>
      <tbody>
        <tr><td>No crit</td><td class="text-right">${(cr.noCrit.freq * 100).toFixed(1)}%</td><td class="text-right">${cr.noCrit.avg.toFixed(1)}</td></tr>
        <tr><td>Single crit</td><td class="text-right">${(cr.singleCrit.freq * 100).toFixed(1)}%</td><td class="text-right">${cr.singleCrit.avg.toFixed(1)}</td></tr>
        <tr><td>Double+ crit</td><td class="text-right">${(cr.doubleCrit.freq * 100).toFixed(1)}%</td><td class="text-right">${cr.doubleCrit.avg.toFixed(1)}</td></tr>
      </tbody>
    </table>
  `;

  // Kill probabilities
  html += `
    <h3>One-Round Kill Probability</h3>
    <table class="data-table">
      <thead><tr><th>Target HP</th><th class="text-right">Kill Chance</th></tr></thead>
      <tbody>
        ${pct.killProbs.map(kp => `
          <tr>
            <td>${kp.hp}</td>
            <td class="text-right ${kp.prob > 0.5 ? 'cell-highlight' : ''}">${(kp.prob * 100).toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  html += `</div>`;

  const container = document.getElementById('table-burst');
  if (container) container.innerHTML = html;
}

// ============================================================
// Action Surge Comparison (Normal vs Surge rounds)
// ============================================================

let compareNormalResult: MonteCarloResult | null = null;
let compareSurgeResult: MonteCarloResult | null = null;
let compareWorker: Worker | null = null;
let comparePhase: 'normal' | 'surge' | null = null;

function runCompare(): void {
  if (!(config.actionSurge?.enabled && config.actionSurge.extraAttacks.length > 0)) return;

  if (compareWorker) {
    compareWorker.terminate();
    compareWorker = null;
  }
  compareNormalResult = null;
  compareSurgeResult = null;

  const simCount = parseInt((document.getElementById('sim-count') as HTMLSelectElement)?.value ?? '100000');
  const targetAC = parseInt((document.getElementById('burst-ac') as HTMLInputElement)?.value ?? '16');

  const progressContainer = document.getElementById('mc-compare-progress');
  const progressFill = document.getElementById('mc-compare-progress-fill');
  const statusEl = document.getElementById('mc-compare-status');
  const runBtn = document.getElementById('btn-run-mc-compare') as HTMLButtonElement;

  if (progressContainer) progressContainer.style.display = '';
  if (runBtn) runBtn.disabled = true;

  function startPhase(surge: boolean): void {
    comparePhase = surge ? 'surge' : 'normal';
    if (statusEl) statusEl.textContent = surge ? 'Simulating Action Surge round...' : 'Simulating normal round...';

    compareWorker = createWorker();

    compareWorker.onmessage = (e: MessageEvent<WorkerProgress | WorkerResult>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        const pct = Math.round(msg.pct * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
      } else if (msg.type === 'result' && msg.resultType === 'montecarlo') {
        const result = msg.data as MonteCarloResult;
        if (comparePhase === 'normal') {
          compareNormalResult = result;
          // Now run surge
          startPhase(true);
        } else {
          compareSurgeResult = result;
          if (progressContainer) progressContainer.style.display = 'none';
          if (runBtn) runBtn.disabled = false;
          if (compareNormalResult && compareSurgeResult) {
            renderCompareResult(compareNormalResult, compareSurgeResult, simCount);
          }
          compareWorker = null;
        }
      }
    };

    compareWorker.onerror = (e: ErrorEvent) => {
      if (progressContainer) progressContainer.style.display = 'none';
      if (runBtn) runBtn.disabled = false;
      if (statusEl) statusEl.textContent = `Error: ${e.message}`;
      compareWorker = null;
    };

    const req: WorkerRequest = {
      type: 'montecarlo',
      config,
      targetAC,
      simCount,
      useActionSurge: surge,
    };
    compareWorker.postMessage(req);
  }

  startPhase(false);
}

function renderCompareResult(normal: MonteCarloResult, surge: MonteCarloResult, simCount: number): void {
  // Overlay histogram comparison (PDF or CDF)
  renderCompareBurstChart(normal, surge, simCount);

  // Comparison summary table
  const nP = normal.percentiles;
  const sP = surge.percentiles;

  const container = document.getElementById('table-burst-compare');
  if (!container) return;

  const deltaClass = (delta: number) => delta > 0 ? 'cell-highlight' : '';
  const fmt1 = (n: number) => n.toFixed(1);
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtDelta = (a: number, b: number) => {
    const d = b - a;
    return `<span class="${deltaClass(d)}">${d >= 0 ? '+' : ''}${fmt1(d)}</span>`;
  };

  let html = `
    <h3>Normal vs Action Surge — Side-by-Side</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>Stat</th>
          <th class="text-right">Normal Round</th>
          <th class="text-right">Action Surge</th>
          <th class="text-right">Delta</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Average</td><td class="text-right">${fmt1(nP.avg)}</td><td class="text-right">${fmt1(sP.avg)}</td><td class="text-right">${fmtDelta(nP.avg, sP.avg)}</td></tr>
        <tr><td>Median (P50)</td><td class="text-right">${fmt1(nP.p50)}</td><td class="text-right">${fmt1(sP.p50)}</td><td class="text-right">${fmtDelta(nP.p50, sP.p50)}</td></tr>
        <tr><td>P75</td><td class="text-right">${fmt1(nP.p75)}</td><td class="text-right">${fmt1(sP.p75)}</td><td class="text-right">${fmtDelta(nP.p75, sP.p75)}</td></tr>
        <tr><td>P90</td><td class="text-right">${fmt1(nP.p90)}</td><td class="text-right">${fmt1(sP.p90)}</td><td class="text-right">${fmtDelta(nP.p90, sP.p90)}</td></tr>
        <tr><td>P99 (Nova)</td><td class="text-right">${fmt1(nP.p99)}</td><td class="text-right">${fmt1(sP.p99)}</td><td class="text-right">${fmtDelta(nP.p99, sP.p99)}</td></tr>
        <tr><td>Max</td><td class="text-right">${fmt1(nP.max)}</td><td class="text-right">${fmt1(sP.max)}</td><td class="text-right">${fmtDelta(nP.max, sP.max)}</td></tr>
        <tr><td>Whiff Rate</td><td class="text-right">${fmtPct(nP.whiffRate)}</td><td class="text-right">${fmtPct(sP.whiffRate)}</td><td class="text-right"></td></tr>
      </tbody>
    </table>
  `;

  // Crit probability section
  const nCr = normal.critRounds;
  const sCr = surge.critRounds;
  html += `
    <h3>Crit Probability (Normal vs Action Surge)</h3>
    <table class="data-table">
      <thead><tr><th>Round Type</th><th class="text-right">Normal</th><th class="text-right">Action Surge</th></tr></thead>
      <tbody>
        <tr><td>No crit</td><td class="text-right">${fmtPct(nCr.noCrit.freq)}</td><td class="text-right">${fmtPct(sCr.noCrit.freq)}</td></tr>
        <tr><td>Single crit</td><td class="text-right">${fmtPct(nCr.singleCrit.freq)}</td><td class="text-right">${fmtPct(sCr.singleCrit.freq)}</td></tr>
        <tr><td>Double+ crit</td><td class="text-right">${fmtPct(nCr.doubleCrit.freq)}</td><td class="text-right ${sCr.doubleCrit.freq > nCr.doubleCrit.freq ? 'cell-highlight' : ''}">${fmtPct(sCr.doubleCrit.freq)}</td></tr>
        <tr><td><strong>At least 1 crit</strong></td><td class="text-right"><strong>${fmtPct(1 - nCr.noCrit.freq)}</strong></td><td class="text-right cell-highlight"><strong>${fmtPct(1 - sCr.noCrit.freq)}</strong></td></tr>
      </tbody>
    </table>
  `;

  // Kill probability comparison
  html += `
    <h3>One-Round Kill Probability (Normal vs Action Surge)</h3>
    <table class="data-table">
      <thead><tr><th>Target HP</th><th class="text-right">Normal</th><th class="text-right">Action Surge</th><th class="text-right">Delta</th></tr></thead>
      <tbody>
        ${nP.killProbs.map((kp, i) => {
          const sKp = sP.killProbs[i] ?? { hp: kp.hp, prob: 0 };
          const delta = sKp.prob - kp.prob;
          return `<tr>
            <td>${kp.hp}</td>
            <td class="text-right ${kp.prob > 0.5 ? 'cell-highlight' : ''}">${fmtPct(kp.prob)}</td>
            <td class="text-right ${sKp.prob > 0.5 ? 'cell-highlight' : ''}">${fmtPct(sKp.prob)}</td>
            <td class="text-right ${deltaClass(delta)}">${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

function renderMookResult(result: MookSimResult): void {
  // Kill distribution chart
  const maxKills = result.killDistribution.length - 1;
  const labels = Array.from({ length: maxKills + 1 }, (_, i) => `${i} kills`);

  renderGroupedBar(
    'chart-mook',
    labels,
    [{
      label: 'Probability',
      data: result.killDistribution,
      color: '#f59e0b',
    }],
    'Probability',
    'Kills per Round',
  );

  const container = document.getElementById('table-mook');
  if (!container) return;

  let html = `
    <div class="burst-stats">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Avg Kills/Round</div>
          <div class="stat-value">${result.avgKills.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Bolts/Kill</div>
          <div class="stat-value">${result.avgBoltsPerKill.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Overkill Tax</div>
          <div class="stat-value">${(result.overkillTax * 100).toFixed(1)}%</div>
          <div class="stat-note">Wasted damage</div>
        </div>
      </div>
      <h3>Kill Distribution</h3>
      <table class="data-table">
        <thead><tr><th>Kills</th><th class="text-right">Probability</th></tr></thead>
        <tbody>
          ${result.killDistribution.map((prob, kills) =>
            prob > 0.005 ? `<tr><td>${kills}</td><td class="text-right">${(prob * 100).toFixed(1)}%</td></tr>` : ''
          ).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================================
// Refresh analysis based on active tab
// ============================================================

let pendingRefresh = false;
let lastRefreshTime = 0;

function scheduleRefresh(tabId?: TabId): void {
  const now = Date.now();
  if (now - lastRefreshTime < 50) {
    if (!pendingRefresh) {
      pendingRefresh = true;
      setTimeout(() => {
        pendingRefresh = false;
        refreshActiveTab(tabId);
      }, 100);
    }
    return;
  }
  refreshActiveTab(tabId);
  lastRefreshTime = Date.now();
}

function refreshActiveTab(overrideTab?: TabId): void {
  const activeTab = overrideTab ?? getCurrentActiveTab();

  switch (activeTab) {
    case 'dpr-curve':
      renderDPRCurveTab();
      break;
    case 'hex':
      renderHexTab();
      break;
    case 'surprise':
      renderSurpriseTab();
      break;
    case 'burst':
    case 'mook':
      // These require explicit "Run" button click — don't auto-run
      break;
  }

  // Always update build name display
  const nameEl = document.getElementById('build-name-display');
  if (nameEl) nameEl.textContent = config.name;
}

function getCurrentActiveTab(): TabId {
  const active = document.querySelector('.tab-btn.active');
  return (active as HTMLElement)?.dataset.tab as TabId ?? 'dpr-curve';
}

// ============================================================
// Import/Export
// ============================================================

/** Sync the preset <select> to the given value without firing 'change'. */
function setPresetDropdown(value: string): void {
  const sel = document.getElementById('preset-select') as HTMLSelectElement | null;
  if (sel) sel.value = value;
}

function exportConfig(): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importConfig(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string) as CharacterConfig;
      config = applyPreset(parsed);
      updateSidebarConfig(config);
      localStorage.setItem('dnd-dpr-config', JSON.stringify(config));
      setPresetDropdown('custom');
      scheduleRefresh();
    } catch {
      alert('Invalid JSON config file');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// Monte Carlo Worker interactions
// ============================================================

function runMonteCarlo(): void {
  if (mcWorker) {
    mcWorker.terminate();
    mcWorker = null;
  }

  const simCount = parseInt((document.getElementById('sim-count') as HTMLSelectElement)?.value ?? '100000');
  const targetAC = parseInt((document.getElementById('burst-ac') as HTMLInputElement)?.value ?? '16');
  const useActionSurge = (document.getElementById('burst-use-actionsurge') as HTMLInputElement)?.checked ?? false;

  const progressContainer = document.getElementById('mc-progress');
  const progressFill = document.getElementById('mc-progress-fill');
  const statusEl = document.getElementById('mc-status');
  const runBtn = document.getElementById('btn-run-mc') as HTMLButtonElement;

  if (progressContainer) progressContainer.style.display = '';
  if (runBtn) runBtn.disabled = true;

  mcWorker = createWorker();

  mcWorker.onmessage = (e: MessageEvent<WorkerProgress | WorkerResult>) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      const pct = Math.round(msg.pct * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = `Simulating... ${pct}%`;
    } else if (msg.type === 'result' && msg.resultType === 'montecarlo') {
      if (progressContainer) progressContainer.style.display = 'none';
      if (runBtn) runBtn.disabled = false;

      const mcResult = msg.data as MonteCarloResult;
      renderMCResult(mcResult);

      mcWorker = null;
    }
  };

  mcWorker.onerror = (e: ErrorEvent) => {
    if (progressContainer) progressContainer.style.display = 'none';
    if (runBtn) runBtn.disabled = false;
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    mcWorker = null;
  };

  const req: WorkerRequest = {
    type: 'montecarlo',
    config,
    targetAC,
    simCount,
    useActionSurge,
  };
  mcWorker.postMessage(req);
}

function runMookSim(): void {
  if (mookWorker) {
    mookWorker.terminate();
    mookWorker = null;
  }

  const simCount = parseInt((document.getElementById('mook-sim-count') as HTMLSelectElement)?.value ?? '50000');
  const mookAC = parseInt((document.getElementById('mook-ac') as HTMLInputElement)?.value ?? '14');
  const mookHP = parseInt((document.getElementById('mook-hp') as HTMLInputElement)?.value ?? '35');

  const progressContainer = document.getElementById('mook-progress');
  const progressFill = document.getElementById('mook-progress-fill');
  const statusEl = document.getElementById('mook-status');
  const runBtn = document.getElementById('btn-run-mook') as HTMLButtonElement;

  if (progressContainer) progressContainer.style.display = '';
  if (runBtn) runBtn.disabled = true;

  mookWorker = createWorker();

  mookWorker.onmessage = (e: MessageEvent<WorkerProgress | WorkerResult>) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      const pct = Math.round(msg.pct * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = `Simulating... ${pct}%`;
    } else if (msg.type === 'result' && msg.resultType === 'mooksim') {
      if (progressContainer) progressContainer.style.display = 'none';
      if (runBtn) runBtn.disabled = false;

      const mookResult = msg.data as MookSimResult;
      renderMookResult(mookResult);

      mookWorker = null;
    }
  };

  mookWorker.onerror = (e: ErrorEvent) => {
    if (progressContainer) progressContainer.style.display = 'none';
    if (runBtn) runBtn.disabled = false;
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    mookWorker = null;
  };

  const req: WorkerRequest = {
    type: 'mooksim',
    config,
    targetAC: mookAC,
    simCount,
    mookHP,
    mookAC,
    hasSurprise: false,
  };
  mookWorker.postMessage(req);
}

// ============================================================
// Init
// ============================================================

function init(): void {
  initTabs((tabId) => {
    scheduleRefresh(tabId);
  });

  initSidebar(config, (updatedConfig) => {
    config = updatedConfig;
    setPresetDropdown('custom');
    scheduleRefresh();
  });

  // Import/Export
  document.getElementById('btn-export')?.addEventListener('click', exportConfig);

  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('file-import')?.click();
  });

  document.getElementById('file-import')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) importConfig(file);
  });

  // Preset selector
  document.getElementById('preset-select')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') return; // nothing to load; user stays on current config
    const preset = PRESETS[val];
    if (preset) {
      config = applyPreset(preset);
      updateSidebarConfig(config);
      localStorage.setItem('dnd-dpr-config', JSON.stringify(config));
      scheduleRefresh();
    }
  });

  // Run simulation buttons
  document.getElementById('btn-run-mc')?.addEventListener('click', runMonteCarlo);
  document.getElementById('btn-run-mook')?.addEventListener('click', runMookSim);
  document.getElementById('btn-run-mc-compare')?.addEventListener('click', runCompare);

  // CDF toggle — re-render from cached results without re-simulating
  document.getElementById('burst-cumulative')?.addEventListener('change', () => {
    if (lastMCResult) {
      renderBurstChart(lastMCResult, lastMCSimCount);
    }
    if (compareNormalResult && compareSurgeResult) {
      renderCompareBurstChart(compareNormalResult, compareSurgeResult, lastMCSimCount);
    }
  });

  // Hex AC input
  document.getElementById('hex-ac')?.addEventListener('change', () => {
    if (getCurrentActiveTab() === 'hex') renderHexTab();
  });

  // Initial render
  scheduleRefresh('dpr-curve');

  // Sync dropdown: saved configs are "Custom"; fresh defaults are crossbow-champion
  setPresetDropdown(configFromLocalStorage ? 'custom' : 'crossbow-champion');
}

document.addEventListener('DOMContentLoaded', init);
