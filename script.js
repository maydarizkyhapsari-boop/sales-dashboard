/**
 * script.js — Sales Analytics Dashboard
 *
 * Architecture:
 *  1. Load JSON data via fetch()
 *  2. Populate filter <select> options dynamically
 *  3. Apply filters → produce a filtered dataset
 *  4. Update KPIs from filtered dataset
 *  5. Render / update all 10 Chart.js instances
 *  6. Render Recent Transactions table (last 15 records)
 *
 * All chart instances are stored in `charts{}` so they can be
 * destroyed and re-created when filters change, preventing
 * "canvas already in use" errors.
 */

'use strict';

// ============================================================
// CONSTANTS & GLOBALS
// ============================================================

/** Path to JSON data file (relative to index.html) */
const DATA_URL = 'data/sales_data.json';

/** Holds the full unfiltered dataset after fetch */
let allData = [];

/** Holds Chart.js instances keyed by chart id */
const charts = {};

/**
 * Consistent colour palette used across all charts.
 * Index maps to: Electronics, Furniture, Clothing, Food, (extra)
 */
const PALETTE = {
  primary:   '#3b82f6',
  secondary: '#8b5cf6',
  success:   '#10b981',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  sky:       '#06b6d4',
  rose:      '#f43f5e',
  indigo:    '#6366f1',
  set: ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f43f5e','#6366f1','#ec4899','#14b8a6'],
};

/** Global Chart.js defaults */
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#64748b';

// ============================================================
// 1. ENTRY POINT — fetch data then bootstrap
// ============================================================

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    allData = await response.json();

    populateFilters(allData);
    bindFilterEvents();
    renderDashboard();          // initial render with no filters
  } catch (err) {
    console.error('Failed to load sales data:', err);
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem;font-family:system-ui">
        <p style="font-size:1.1rem;color:#ef4444;font-weight:600;">⚠ Could not load sales_data.json</p>
        <p style="color:#64748b;font-size:.875rem;">Make sure you open the dashboard through a local server (e.g. Live Server in VS Code).<br>Direct <code>file://</code> protocol blocks fetch() requests.</p>
        <p style="color:#94a3b8;font-size:.8rem;">${err.message}</p>
      </div>`;
  }
}

// ============================================================
// 2. FILTERS — populate selects & bind change events
// ============================================================

/**
 * Reads unique values from the dataset and fills each <select>.
 * @param {Array} data - full dataset
 */
function populateFilters(data) {
  const unique = (key) => [...new Set(data.map(d => d[key]))].sort();

  fillSelect('filter-region',   unique('region'));
  fillSelect('filter-category', unique('category'));
  fillSelect('filter-customer', unique('customer_type'));
  fillSelect('filter-channel',  unique('sales_channel'));
}

/**
 * Appends <option> elements to a <select> by id.
 * @param {string} selectId - element id
 * @param {string[]} values - option values / labels
 */
function fillSelect(selectId, values) {
  const sel = document.getElementById(selectId);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

/** Attach change listeners to all filter selects */
function bindFilterEvents() {
  ['filter-region', 'filter-category', 'filter-customer', 'filter-channel'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      renderDashboard();
      updateFilterBadge();
    });
  });

  // "Clear filters" button in header badge
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
}

/** Returns the current filter state as an object */
function getFilters() {
  return {
    region:   document.getElementById('filter-region').value,
    category: document.getElementById('filter-category').value,
    customer: document.getElementById('filter-customer').value,
    channel:  document.getElementById('filter-channel').value,
  };
}

/** Applies active filters to allData and returns filtered array */
function applyFilters() {
  const f = getFilters();
  return allData.filter(d =>
    (f.region   === 'all' || d.region          === f.region)   &&
    (f.category === 'all' || d.category        === f.category) &&
    (f.customer === 'all' || d.customer_type   === f.customer) &&
    (f.channel  === 'all' || d.sales_channel   === f.channel)
  );
}

/** Resets all selects to "all" */
function clearFilters() {
  ['filter-region', 'filter-category', 'filter-customer', 'filter-channel'].forEach(id => {
    document.getElementById(id).value = 'all';
  });
  renderDashboard();
  updateFilterBadge();
}

/** Shows/hides the active-filter badge in the header */
function updateFilterBadge() {
  const f = getFilters();
  const active = Object.values(f).filter(v => v !== 'all');
  const badge  = document.getElementById('filter-badge');
  const text   = document.getElementById('filter-badge-text');

  if (active.length > 0) {
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    text.textContent = `${active.length} filter${active.length > 1 ? 's' : ''} active`;
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

// ============================================================
// 3. MASTER RENDER — called on init and every filter change
// ============================================================

function renderDashboard() {
  const data = applyFilters();

  updateKPIs(data);
  renderTrendChart(data);
  renderRegionChart(data);
  renderCategoryChart(data);
  renderRepChart(data);
  renderCustomerChart(data);
  renderPaymentChart(data);
  renderChannelChart(data);
  renderScatterChart(data);
  renderTop10Chart(data);
  renderQtyCategoryChart(data);
  renderTable(data);
}

// ============================================================
// 4. KPI CARDS
// ============================================================

/**
 * Formats a number as USD currency string.
 * @param {number} n
 * @returns {string}
 */
function fmtCurrency(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function updateKPIs(data) {
  const totalRevenue      = data.reduce((s, d) => s + d.revenue, 0);
  const totalTransactions = data.length;
  const totalQuantity     = data.reduce((s, d) => s + d.quantity, 0);
  const avgDiscount       = data.length > 0
    ? data.reduce((s, d) => s + d.discount, 0) / data.length
    : 0;

  setKPI('kpi-revenue',      fmtCurrency(totalRevenue),      `${totalTransactions} transactions`);
  setKPI('kpi-transactions', totalTransactions.toLocaleString(), `${totalTransactions} records`);
  setKPI('kpi-quantity',     totalQuantity.toLocaleString(),  `${totalQuantity} units`);
  setKPI('kpi-discount',     `${(avgDiscount * 100).toFixed(1)}%`, `across all transactions`);
}

/**
 * Updates a KPI card value and sub-text with a brief flash animation.
 */
function setKPI(id, value, sub) {
  const el    = document.getElementById(id);
  const subEl = document.getElementById(id + '-sub');

  el.classList.add('updating');
  setTimeout(() => {
    el.textContent = value;
    el.classList.remove('updating');
  }, 120);

  if (subEl) subEl.textContent = `— ${sub}`;
}

// ============================================================
// 5. UTILITY — group/aggregate helpers
// ============================================================

/**
 * Groups data by a field and sums a numeric property.
 * @param {Array} data
 * @param {string} groupKey  - field to group by
 * @param {string} sumKey    - field to sum
 * @returns {{ labels: string[], values: number[] }}
 */
function groupAndSum(data, groupKey, sumKey) {
  const map = {};
  data.forEach(d => {
    const k = d[groupKey];
    map[k] = (map[k] || 0) + d[sumKey];
  });
  const labels = Object.keys(map).sort();
  const values = labels.map(l => parseFloat(map[l].toFixed(2)));
  return { labels, values };
}

/**
 * Groups data by a field and counts occurrences.
 */
function groupAndCount(data, groupKey) {
  const map = {};
  data.forEach(d => {
    const k = d[groupKey];
    map[k] = (map[k] || 0) + 1;
  });
  const labels = Object.keys(map).sort();
  const values = labels.map(l => map[l]);
  return { labels, values };
}

/**
 * Destroys an existing Chart.js instance if it exists, then creates a new one.
 * This is the safest approach for dynamic filter updates.
 * @param {string} id  - canvas element id
 * @param {object} config - Chart.js config object
 */
function renderChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, config);
}

/**
 * Shared tooltip styling applied to all charts.
 */
const TOOLTIP_DEFAULTS = {
  backgroundColor: 'rgba(15,23,42,0.85)',
  titleColor: '#f1f5f9',
  bodyColor:  '#cbd5e1',
  borderColor: 'rgba(255,255,255,.08)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  displayColors: true,
  boxPadding: 4,
};

// ============================================================
// 6. CHART: Sales Trend (Monthly Revenue — Line)
// ============================================================

function renderTrendChart(data) {
  // Group by month (YYYY-MM)
  const map = {};
  data.forEach(d => {
    const month = d.date.substring(0, 7); // "2024-01"
    map[month] = (map[month] || 0) + d.revenue;
  });

  const labels = Object.keys(map).sort();
  const values = labels.map(l => parseFloat(map[l].toFixed(2)));

  // Human-readable month labels (e.g. "Jan 2024")
  const niceLabels = labels.map(l => {
    const [y, m] = l.split('-');
    return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
  });

  renderChart('chart-trend', {
    type: 'line',
    data: {
      labels: niceLabels,
      datasets: [{
        label: 'Monthly Revenue',
        data: values,
        borderColor: PALETTE.primary,
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: PALETTE.primary,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => ` Revenue: ${fmtCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 45, font: { size: 11 } }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: v => fmtCurrency(v),
            font: { size: 11 }
          }
        }
      }
    }
  });
}

// ============================================================
// 7. CHART: Revenue per Region (Bar)
// ============================================================

function renderRegionChart(data) {
  const { labels, values } = groupAndSum(data, 'region', 'revenue');

  const bgColors  = PALETTE.set.slice(0, labels.length);
  const brdColors = bgColors.map(c => c + 'cc'); // slightly more opaque border

  renderChart('chart-region', {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: bgColors.map(c => c + '99'), // ~60 % opacity fill
        borderColor: bgColors,
        borderWidth: 2,
        hoverBackgroundColor: bgColors.map(c => c + 'cc'),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 10,
            font: { size: 11 },
            color: '#64748b',
          }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.parsed.r)}`
          }
        }
      },
      scales: {
        r: {
          ticks: {
            callback: v => fmtCurrency(v),
            font: { size: 10 },
            color: '#94a3b8',
            backdropColor: 'transparent',
          },
          grid: { color: '#e2e8f0' },
          angleLines: { color: '#e2e8f0' },
        }
      }
    }
  });
}

// ============================================================
// 8. CHART: Revenue per Product Category (Doughnut)
// ============================================================

function renderCategoryChart(data) {
  const { labels, values } = groupAndSum(data, 'category', 'revenue');

  renderChart('chart-category', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.set.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${fmtCurrency(ctx.parsed)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// 9. CHART: Sales per Sales Representative (Horizontal Bar)
// ============================================================

function renderRepChart(data) {
  const { labels, values } = groupAndSum(data, 'sales_rep', 'revenue');

  // Sort descending
  const sorted = labels.map((l, i) => ({ label: l, value: values[i] }))
                        .sort((a, b) => b.value - a.value);

  renderChart('chart-rep', {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.label),
      datasets: [{
        label: 'Revenue',
        data: sorted.map(s => s.value),
        backgroundColor: PALETTE.set.slice(0, sorted.length),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',         // horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: { label: ctx => ` ${fmtCurrency(ctx.parsed.x)}` }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => fmtCurrency(v), font: { size: 11 } }
        },
        y: { grid: { display: false } }
      }
    }
  });
}

// ============================================================
// 10. CHART: Customer Type Distribution (Pie)
// ============================================================

function renderCustomerChart(data) {
  const { labels, values } = groupAndCount(data, 'customer_type');

  renderChart('chart-customer', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.primary, PALETTE.secondary, PALETTE.success],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed} transactions (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// 11. CHART: Payment Method Usage (Doughnut)
// ============================================================

function renderPaymentChart(data) {
  const { labels, values } = groupAndCount(data, 'payment_method');

  renderChart('chart-payment', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.warning, PALETTE.success, PALETTE.sky],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed} transactions (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// 12. CHART: Sales Channel Distribution (Bar)
// ============================================================

function renderChannelChart(data) {
  // Group by channel and compute both revenue and count
  const revenueMap = {};
  const countMap   = {};
  data.forEach(d => {
    revenueMap[d.sales_channel] = (revenueMap[d.sales_channel] || 0) + d.revenue;
    countMap[d.sales_channel]   = (countMap[d.sales_channel]   || 0) + 1;
  });
  const labels       = Object.keys(revenueMap).sort();
  const revenueVals  = labels.map(l => parseFloat(revenueMap[l].toFixed(2)));
  const countVals    = labels.map(l => countMap[l]);

  renderChart('chart-channel', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: revenueVals,
          backgroundColor: [PALETTE.primary, PALETTE.secondary],
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: 'y',
        },
        {
          label: 'Transactions',
          data: countVals,
          backgroundColor: [
            'rgba(59,130,246,0.25)',
            'rgba(139,92,246,0.25)',
          ],
          borderColor: [PALETTE.primary, PALETTE.secondary],
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
          type: 'bar',
          yAxisID: 'y2',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ` Revenue: ${fmtCurrency(ctx.parsed.y)}`
              : ` Transactions: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          position: 'left',
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => fmtCurrency(v), font: { size: 10 } }
        },
        y2: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

// ============================================================
// 13. CHART: Discount vs Revenue (Scatter)
// ============================================================

function renderScatterChart(data) {
  // Each point: x = discount (%), y = revenue ($)
  const points = data.map(d => ({
    x: parseFloat((d.discount * 100).toFixed(1)),
    y: d.revenue,
    label: d.product,
  }));

  // Colour points by category
  const categories = [...new Set(data.map(d => d.category))].sort();
  const catIndex   = Object.fromEntries(categories.map((c, i) => [c, i]));

  const datasets = categories.map((cat, i) => ({
    label: cat,
    data: data
      .filter(d => d.category === cat)
      .map(d => ({ x: parseFloat((d.discount * 100).toFixed(1)), y: d.revenue })),
    backgroundColor: PALETTE.set[i] + 'cc',
    pointRadius: 5,
    pointHoverRadius: 7,
  }));

  renderChart('chart-scatter', {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => ` Discount: ${ctx.parsed.x}% · Revenue: ${fmtCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount (%)', font: { size: 11 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => `${v}%` }
        },
        y: {
          title: { display: true, text: 'Revenue ($)', font: { size: 11 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => fmtCurrency(v), font: { size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// 14. CHART: Top 10 Highest Revenue Transactions (Bar)
// ============================================================

function renderTop10Chart(data) {
  // Sort by revenue descending, take top 10
  const top10 = [...data]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Label: "Product (Region)" truncated
  const labels = top10.map(d => `${d.product} · ${d.region}`);
  const values = top10.map(d => d.revenue);

  // Gradient colours for ranks
  const bgColors = top10.map((_, i) => {
    const alpha = 1 - i * 0.07;
    return `rgba(59,130,246,${alpha.toFixed(2)})`;
  });

  renderChart('chart-top10', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: bgColors,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: ctx => ` ${fmtCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => fmtCurrency(v), font: { size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

// ============================================================
// 15. CHART: Quantity Sold per Category (Bar)
// ============================================================

function renderQtyCategoryChart(data) {
  const { labels, values } = groupAndSum(data, 'category', 'quantity');

  renderChart('chart-qty-category', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Quantity Sold',
        data: values,
        backgroundColor: PALETTE.set.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} units` }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => v.toLocaleString(), font: { size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// 16. DATA TABLE — Recent Transactions (up to 15)
// ============================================================

/**
 * Returns a CSS class for the discount badge based on value.
 * @param {number} d - discount as a decimal (0–1)
 */
function discountBadgeClass(d) {
  if (d === 0)      return 'discount-badge discount-badge--zero';
  if (d <= 0.08)    return 'discount-badge discount-badge--low';
  if (d <= 0.15)    return 'discount-badge discount-badge--medium';
  return 'discount-badge discount-badge--high';
}

function renderTable(data) {
  const tbody = document.getElementById('data-table-body');
  const count = document.getElementById('table-count');

  // Show last 15 records (sorted by date desc)
  const rows = [...data]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15);

  count.textContent = `${data.length} records`;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-4 py-10 text-center text-slate-400 text-sm">
          No transactions match the current filters.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = rows.map(d => {
    const dateFormatted = new Date(d.date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const channelPill = `<span class="pill ${d.sales_channel === 'Online' ? 'pill--online' : 'pill--offline'}">${d.sales_channel}</span>`;
    const discountEl  = `<span class="${discountBadgeClass(d.discount)}">${(d.discount * 100).toFixed(0)}%</span>`;

    return `
      <tr>
        <td>${dateFormatted}</td>
        <td class="font-medium text-slate-700">${d.product}</td>
        <td>${d.region}</td>
        <td>${d.category}</td>
        <td>${d.sales_rep}</td>
        <td>${channelPill}</td>
        <td class="td-revenue">${fmtCurrency(d.revenue)}</td>
        <td class="text-right">${discountEl}</td>
      </tr>`;
  }).join('');
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', init);
