// ============================================================
// Main Entry Point — D&D 5.5e DPR Calculator
// ============================================================
import './style.css';
import { initSidebar, updateSidebarConfig } from './ui/sidebar.js';
import { initTabs } from './ui/tabs.js';
import { renderLineChart, renderBarChart, renderGroupedBar } from './ui/charts.js';
import { renderDPRTable, renderTable, fmtDec, fmtSigned } from './ui/tables.js';
import { analyzeDPRCurve } from './analysis/dpr-curve.js';
import { buildHistogramBins } from './analysis/burst.js';
import { analyzeHex } from './analysis/hex.js';
import { analyzeSurprise } from './analysis/surprise.js';
import crossbowPreset from './presets/crossbow-champion.json';
// ============================================================
// State
// ============================================================
let config = loadConfig();
// ============================================================
// Worker management
// ============================================================
let mcWorker = null;
let mookWorker = null;
function createWorker() {
    return new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
}
// ============================================================
// Config persistence
// ============================================================
function loadConfig() {
    const saved = localStorage.getItem('dnd-dpr-config');
    if (saved) {
        try {
            return JSON.parse(saved);
        }
        catch {
            // fall through to preset
        }
    }
    return applyPreset(crossbowPreset);
}
function applyPreset(preset) {
    // Ensure all required fields have defaults
    return {
        ...preset,
        attacks: preset.attacks.map(a => Object.assign({ useSharpshooter: true }, a)),
        riders: (preset.riders ?? []).map(r => Object.assign({ enabled: true, placement: 'firstAvailable', requiresBonusAction: false, perTurnLimit: 0 }, r)),
        advantageSources: preset.advantageSources ?? {
            surprise: false,
            luckyOnAtk1: false,
            flanking: false,
        },
        weaponMastery: preset.weaponMastery ?? { vex: false },
    };
}
// ============================================================
// Analysis rendering
// ============================================================
function renderDPRCurveTab() {
    const result = analyzeDPRCurve(config);
    renderLineChart('chart-dpr', result.acs, result.scenarios, 'Average DPR', 'Target AC');
    renderDPRTable('table-dpr', result.acs, result.scenarios, result.breakpoints);
}
function renderHexTab() {
    const acInput = document.getElementById('hex-ac');
    const ac = parseInt(acInput?.value ?? '16') || 16;
    const result = analyzeHex(config, ac);
    // Bar chart — DPR comparison
    renderBarChart('chart-hex', result.scenarios.map(s => s.label), [{
            label: 'DPR',
            data: result.scenarios.map(s => s.dpr),
            color: '#6366f1',
        }], 'DPR', 'Scenario');
    // Amortized table
    if (result.amortizedTable.length > 0) {
        renderTable('table-hex', [
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
        ], result.amortizedTable, `Hex/Concentration break-even (AC ${ac}): ${result.breakEvenRounds ? `worth it if target lives ${result.breakEvenRounds}+ rounds` : 'No spell rider configured'}`);
    }
    else {
        const el = document.getElementById('table-hex');
        if (el)
            el.innerHTML = '<p class="muted">No concentration spell rider configured. Add a rider with "On hit while active" trigger.</p>';
    }
}
function renderSurpriseTab() {
    const result = analyzeSurprise(config);
    renderLineChart('chart-surprise', result.acs, result.scenarios, 'DPR', 'Target AC');
    // 3-round table
    renderTable('table-surprise', [
        { key: 'strategy', header: 'Strategy', render: (r) => r.strategy },
        { key: 'rnd1', header: 'Rnd 1', render: (r) => r.rnd1, format: fmtDec(1), alignRight: true },
        { key: 'rnd2', header: 'Rnd 2', render: (r) => r.rnd2, format: fmtDec(1), alignRight: true },
        { key: 'rnd3', header: 'Rnd 3', render: (r) => r.rnd3, format: fmtDec(1), alignRight: true },
        { key: 'total', header: '3-Rnd Total', render: (r) => r.total, format: fmtDec(1),
            highlight: (r, rows) => r.total === Math.max(...rows.map(x => x.total)),
            alignRight: true },
        { key: 'avg', header: 'Avg/Rnd', render: (r) => r.avgPerRound, format: fmtDec(1), alignRight: true },
    ], result.threeRoundTable, '3-Round Comparison (AC 16)');
}
function renderMCResult(result) {
    const simCount = document.getElementById('sim-count')?.value ?? '100000';
    const n = parseInt(simCount);
    // Histogram
    const bins = buildHistogramBins(result.histogram, n, result.percentiles.p50, result.percentiles.p90);
    renderBarChart('chart-burst', bins.map(b => b.label), [{
            label: 'Probability',
            data: bins.map(b => b.count),
            color: '#6366f1',
        }], 'Probability', 'Damage (grouped)');
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
    if (container)
        container.innerHTML = html;
}
function renderMookResult(result) {
    // Kill distribution chart
    const maxKills = result.killDistribution.length - 1;
    const labels = Array.from({ length: maxKills + 1 }, (_, i) => `${i} kills`);
    renderGroupedBar('chart-mook', labels, [{
            label: 'Probability',
            data: result.killDistribution,
            color: '#f59e0b',
        }], 'Probability', 'Kills per Round');
    const container = document.getElementById('table-mook');
    if (!container)
        return;
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
          ${result.killDistribution.map((prob, kills) => prob > 0.005 ? `<tr><td>${kills}</td><td class="text-right">${(prob * 100).toFixed(1)}%</td></tr>` : '').join('')}
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
function scheduleRefresh(tabId) {
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
function refreshActiveTab(overrideTab) {
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
    if (nameEl)
        nameEl.textContent = config.name;
}
function getCurrentActiveTab() {
    const active = document.querySelector('.tab-btn.active');
    return active?.dataset.tab ?? 'dpr-curve';
}
// ============================================================
// Import/Export
// ============================================================
function exportConfig() {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target?.result);
            config = applyPreset(parsed);
            updateSidebarConfig(config);
            localStorage.setItem('dnd-dpr-config', JSON.stringify(config));
            scheduleRefresh();
        }
        catch {
            alert('Invalid JSON config file');
        }
    };
    reader.readAsText(file);
}
// ============================================================
// Monte Carlo Worker interactions
// ============================================================
function runMonteCarlo() {
    if (mcWorker) {
        mcWorker.terminate();
        mcWorker = null;
    }
    const simCount = parseInt(document.getElementById('sim-count')?.value ?? '100000');
    const targetAC = parseInt(document.getElementById('burst-ac')?.value ?? '16');
    const progressContainer = document.getElementById('mc-progress');
    const progressFill = document.getElementById('mc-progress-fill');
    const statusEl = document.getElementById('mc-status');
    const runBtn = document.getElementById('btn-run-mc');
    if (progressContainer)
        progressContainer.style.display = '';
    if (runBtn)
        runBtn.disabled = true;
    mcWorker = createWorker();
    mcWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
            const pct = Math.round(msg.pct * 100);
            if (progressFill)
                progressFill.style.width = `${pct}%`;
            if (statusEl)
                statusEl.textContent = `Simulating... ${pct}%`;
        }
        else if (msg.type === 'result' && msg.resultType === 'montecarlo') {
            if (progressContainer)
                progressContainer.style.display = 'none';
            if (runBtn)
                runBtn.disabled = false;
            const mcResult = msg.data;
            renderMCResult(mcResult);
            mcWorker = null;
        }
    };
    const req = {
        type: 'montecarlo',
        config,
        targetAC,
        simCount,
    };
    mcWorker.postMessage(req);
}
function runMookSim() {
    if (mookWorker) {
        mookWorker.terminate();
        mookWorker = null;
    }
    const simCount = parseInt(document.getElementById('mook-sim-count')?.value ?? '50000');
    const mookAC = parseInt(document.getElementById('mook-ac')?.value ?? '14');
    const mookHP = parseInt(document.getElementById('mook-hp')?.value ?? '35');
    const progressContainer = document.getElementById('mook-progress');
    const progressFill = document.getElementById('mook-progress-fill');
    const statusEl = document.getElementById('mook-status');
    const runBtn = document.getElementById('btn-run-mook');
    if (progressContainer)
        progressContainer.style.display = '';
    if (runBtn)
        runBtn.disabled = true;
    mookWorker = createWorker();
    mookWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
            const pct = Math.round(msg.pct * 100);
            if (progressFill)
                progressFill.style.width = `${pct}%`;
            if (statusEl)
                statusEl.textContent = `Simulating... ${pct}%`;
        }
        else if (msg.type === 'result' && msg.resultType === 'mooksim') {
            if (progressContainer)
                progressContainer.style.display = 'none';
            if (runBtn)
                runBtn.disabled = false;
            const mookResult = msg.data;
            renderMookResult(mookResult);
            mookWorker = null;
        }
    };
    const req = {
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
function init() {
    initTabs((tabId) => {
        scheduleRefresh(tabId);
    });
    initSidebar(config, (updatedConfig) => {
        config = updatedConfig;
        scheduleRefresh();
    });
    // Import/Export
    document.getElementById('btn-export')?.addEventListener('click', exportConfig);
    document.getElementById('btn-import')?.addEventListener('click', () => {
        document.getElementById('file-import')?.click();
    });
    document.getElementById('file-import')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file)
            importConfig(file);
    });
    // Preset selector
    document.getElementById('preset-select')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'crossbow') {
            config = applyPreset(crossbowPreset);
            updateSidebarConfig(config);
            localStorage.setItem('dnd-dpr-config', JSON.stringify(config));
            scheduleRefresh();
        }
    });
    // Run simulation buttons
    document.getElementById('btn-run-mc')?.addEventListener('click', runMonteCarlo);
    document.getElementById('btn-run-mook')?.addEventListener('click', runMookSim);
    // Hex AC input
    document.getElementById('hex-ac')?.addEventListener('change', () => {
        if (getCurrentActiveTab() === 'hex')
            renderHexTab();
    });
    // Initial render
    scheduleRefresh('dpr-curve');
}
document.addEventListener('DOMContentLoaded', init);
