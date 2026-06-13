// ============================================================
// Table Rendering Utilities
// ============================================================

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => string | number;
  highlight?: (row: T, rows: T[]) => boolean;
  format?: (val: string | number) => string;
  alignRight?: boolean;
}

export function renderTable<T>(
  containerId: string,
  columns: TableColumn<T>[],
  rows: T[],
  caption?: string,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const thead = `<tr>${columns.map(c =>
    `<th class="${c.alignRight ? 'text-right' : ''}">${c.header}</th>`
  ).join('')}</tr>`;

  const tbody = rows.map(row => {
    const cells = columns.map(col => {
      const rawVal = col.render(row);
      const displayed = col.format ? col.format(rawVal) : rawVal;
      const isHighlighted = col.highlight ? col.highlight(row, rows) : false;
      const cls = [
        col.alignRight ? 'text-right' : '',
        isHighlighted ? 'cell-highlight' : '',
      ].filter(Boolean).join(' ');
      return `<td class="${cls}">${displayed}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  const captionHtml = caption ? `<caption>${caption}</caption>` : '';

  container.innerHTML = `
    <table class="data-table">
      ${captionHtml}
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

/** Highlight the max value in a set of numeric cells across rows */
export function highlightMax<T>(
  getValue: (row: T) => number,
): (row: T, rows: T[]) => boolean {
  return (row, rows) => {
    const vals = rows.map(getValue);
    const max = Math.max(...vals);
    return getValue(row) === max;
  };
}

/** Format a number as fixed decimal */
export function fmtDec(places: number): (val: string | number) => string {
  return (val) => Number(val).toFixed(places);
}

/** Format as percentage */
export function fmtPct(places: number = 1): (val: string | number) => string {
  return (val) => `${(Number(val) * 100).toFixed(places)}%`;
}

/** Format with sign */
export function fmtSigned(places: number = 1): (val: string | number) => string {
  return (val) => {
    const n = Number(val);
    return (n >= 0 ? '+' : '') + n.toFixed(places);
  };
}

/** Render a DPR table with per-row best-value highlighting */
export function renderDPRTable(
  containerId: string,
  acs: number[],
  scenarios: { label: string; data: number[] }[],
  breakpoints: { allSSvsSkip: number; skipSSvsNoSS: number },
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const thead = `
    <tr>
      <th>AC</th>
      ${scenarios.map(s => `<th class="text-right">${s.label}</th>`).join('')}
      <th>Best Strategy</th>
    </tr>
  `;

  const tbody = acs.map((ac, idx) => {
    const dprs = scenarios.map(s => s.data[idx]);
    const maxDPR = Math.max(...dprs);
    const bestIdx = dprs.indexOf(maxDPR);
    const bestLabel = scenarios[bestIdx]?.label ?? '';

    const cells = scenarios.map((s, i) => {
      const isBest = Math.abs(dprs[i] - maxDPR) < 0.01;
      return `<td class="text-right ${isBest ? 'cell-highlight' : ''}">${dprs[i].toFixed(1)}</td>`;
    }).join('');

    // Breakpoint styling
    let rowClass = '';
    if (ac === breakpoints.allSSvsSkip) rowClass = 'row-breakpoint';
    else if (ac === breakpoints.skipSSvsNoSS) rowClass = 'row-breakpoint';

    return `<tr class="${rowClass}">
      <td>${ac}</td>
      ${cells}
      <td class="cell-best">${bestLabel}</td>
    </tr>`;
  }).join('');

  const bpNote = scenarios.length > 1 ? `
    <div class="breakpoint-note">
      ${breakpoints.allSSvsSkip < 30 ? `<span>🔶 SS breakpoint (all→skip Atk1): AC ${breakpoints.allSSvsSkip}</span>` : ''}
      ${breakpoints.skipSSvsNoSS < 30 ? `<span>🔷 SS breakpoint (any→none): AC ${breakpoints.skipSSvsNoSS}</span>` : ''}
    </div>
  ` : '';

  container.innerHTML = `
    ${bpNote}
    <table class="data-table">
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}
