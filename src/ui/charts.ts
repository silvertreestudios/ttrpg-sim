// ============================================================
// Chart.js Wrapper
// ============================================================

import {
  Chart,
  LineController, LineElement, PointElement,
  BarController, BarElement,
  LinearScale, CategoryScale,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  LinearScale, CategoryScale,
  Title, Tooltip, Legend, Filler,
);

// Global chart defaults for dark theme
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.backgroundColor = 'rgba(99, 102, 241, 0.1)';

// Chart registry
const charts = new Map<string, Chart>();

function destroyChart(id: string): void {
  const existing = charts.get(id);
  if (existing) {
    existing.destroy();
    charts.delete(id);
  }
}

export interface LineDataset {
  label: string;
  data: number[];
  color: string;
  dashed?: boolean;
}

/** Render a multi-line chart */
export function renderLineChart(
  canvasId: string,
  labels: (string | number)[],
  datasets: LineDataset[],
  yLabel: string = 'DPR',
  xLabel: string = 'AC',
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  destroyChart(canvasId);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.map(String),
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: ds.color + '22',
        borderWidth: 2,
        borderDash: ds.dashed ? [5, 5] : [],
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', padding: 16, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#334155',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8' },
        },
        y: {
          title: { display: true, text: yLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8' },
          beginAtZero: true,
        },
      },
    },
  });

  charts.set(canvasId, chart);
}

export interface BarDataset {
  label: string;
  data: number[];
  color: string;
}

/** Render a bar histogram */
export function renderBarChart(
  canvasId: string,
  labels: string[],
  datasets: BarDataset[],
  yLabel: string = 'Probability',
  xLabel: string = 'Damage',
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  destroyChart(canvasId);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color + 'bb',
        borderColor: ds.color,
        borderWidth: 1,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', padding: 16 },
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#334155',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${((ctx.parsed.y ?? 0) * 100).toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', maxRotation: 45, maxTicksLimit: 20 },
        },
        y: {
          title: { display: true, text: yLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: {
            color: '#94a3b8',
            callback: (val) => `${(Number(val) * 100).toFixed(0)}%`,
          },
          beginAtZero: true,
        },
      },
    },
  });

  charts.set(canvasId, chart);
}

export interface CDFDataset {
  label: string;
  data: number[];   // parallel to labels — each value is P(damage >= X) as fraction 0–1
  color: string;
}

/**
 * Render a CDF / survival-function line chart.
 *
 * Y-axis: 0–100 % (percentage chance of dealing that damage or more)
 * X-axis: damage bucket labels (same as histogram)
 * Horizontal reference lines at 25 %, 50 %, 75 %.
 */
export function renderCDFChart(
  canvasId: string,
  labels: string[],
  datasets: CDFDataset[],
  yLabel: string = 'P(damage ≥ X)',
  xLabel: string = 'Damage',
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  destroyChart(canvasId);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, idx) => ({
        label: ds.label,
        data: ds.data.map(v => v * 100),   // fraction → percentage for display
        borderColor: ds.color,
        backgroundColor: ds.color + '22',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,            // stepped / straight lines — survival function is a staircase
        fill: false,
        // make the second dataset dashed so Normal vs Surge are visually distinct
        borderDash: idx === 1 ? [6, 3] : [],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', padding: 16, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#334155',
          borderWidth: 1,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}%`,
          },
        },
        // Annotation plugin is not registered, so we draw reference lines
        // via a custom afterDraw plugin passed inline.
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', maxRotation: 45, maxTicksLimit: 20 },
        },
        y: {
          title: { display: true, text: yLabel, color: '#94a3b8' },
          grid: {
            color: (ctx) => {
              // Highlight the 25/50/75 gridlines
              const v = ctx.tick?.value;
              if (v === 25 || v === 50 || v === 75) return '#475569';
              return '#1e293b';
            },
          },
          ticks: {
            color: '#94a3b8',
            callback: (val) => `${val}%`,
            stepSize: 25,
          },
          min: 0,
          max: 100,
        },
      },
    },
  });

  charts.set(canvasId, chart);
}

/** Render a grouped bar chart (for kill distribution) */
export function renderGroupedBar(
  canvasId: string,
  labels: string[],
  datasets: BarDataset[],
  yLabel: string = 'Probability',
  xLabel: string = '',
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  destroyChart(canvasId);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color + 'bb',
        borderColor: ds.color,
        borderWidth: 1,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8' },
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#334155',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${((ctx.parsed.y ?? 0) * 100).toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8' },
        },
        y: {
          title: { display: true, text: yLabel, color: '#94a3b8' },
          grid: { color: '#1e293b' },
          ticks: {
            color: '#94a3b8',
            callback: (val) => `${(Number(val) * 100).toFixed(0)}%`,
          },
          beginAtZero: true,
        },
      },
    },
  });

  charts.set(canvasId, chart);
}
