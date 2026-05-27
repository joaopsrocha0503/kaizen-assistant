// ============================================================================
// dashboard.js — KPIs, gráficos Chart.js, painel de alertas e recentes.
// ============================================================================
import {
  apiGetKpis, apiGetMonthlyStats, apiGetUpcomingActions, apiGetProblems,
} from "./api.js";
import {
  badge, formatDate, renderIcons, PRIORITY_LABELS,
} from "./ui.js";

let _monthlyChart = null;
const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function renderMonthlyChart(data) {
  if (_monthlyChart) {
    _monthlyChart.destroy();
    _monthlyChart = null;
  }

  const labels = data.map(d => {
    const [year, month] = d.month.split("-");
    return `${PT_MONTHS[parseInt(month, 10) - 1]} '${year.slice(2)}`;
  });
  const values = data.map(d => d.count);
  const maxVal = Math.max(...values, 1);

  const ctx = document.getElementById("monthly-chart").getContext("2d");
  _monthlyChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Kaizens registados",
        data: values,
        borderColor: "#1A56DB",
        backgroundColor: "rgba(26,86,219,0.07)",
        borderWidth: 2.5,
        pointBackgroundColor: "#1A56DB",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: c => ` ${c.parsed.y} kaizen${c.parsed.y !== 1 ? "s" : ""}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: maxVal + 1,
          ticks: { precision: 0, stepSize: 1, color: "#94a3b8" },
          grid: { color: "rgba(0,0,0,0.05)" },
          border: { dash: [4, 4], display: false },
        },
        x: {
          ticks: { color: "#94a3b8" },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

function _daysUntil(deadlineStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(deadlineStr + "T00:00:00");
  return Math.round((dl - today) / 86400000);
}

function renderAlertsPanel(actions) {
  const el = document.getElementById("alerts-panel");
  if (!actions.length) { el.innerHTML = ""; return; }

  const rows = actions.map(a => {
    const days = _daysUntil(a.deadline);
    let urgencyClass, chipClass, chipLabel, dlClass;

    if (days === 0) {
      urgencyClass = "urgency-today"; chipClass = "chip-today";
      chipLabel = "Hoje"; dlClass = "dl-critical";
    } else if (days === 1) {
      urgencyClass = "urgency-tomorrow"; chipClass = "chip-tomorrow";
      chipLabel = "Amanhã"; dlClass = "dl-critical";
    } else if (days <= 3) {
      urgencyClass = "urgency-soon"; chipClass = "chip-soon";
      chipLabel = `${days} dias`; dlClass = "dl-warning";
    } else {
      urgencyClass = "urgency-week"; chipClass = "chip-week";
      chipLabel = `${days} dias`; dlClass = "dl-normal";
    }

    const dl = new Date(a.deadline + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });

    return `<div class="alert-item ${urgencyClass}" data-action="open-detail" data-id="${a.problem_id}">
      <span class="alert-chip ${chipClass}">${chipLabel}</span>
      <div class="alert-info">
        <div class="alert-action-title">${a.title}</div>
        <div class="alert-meta">${a.problem_title} &middot; ${a.responsible}</div>
      </div>
      <span class="alert-deadline ${dlClass}"><i data-lucide="calendar"></i>${dl}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="alerts-panel">
    <div class="alerts-panel-header">
      <span class="alerts-panel-icon"><i data-lucide="alert-triangle"></i></span>
      <span class="alerts-panel-title">Ações com Prazo nos Próximos 7 Dias</span>
      <span class="alerts-panel-count">${actions.length}</span>
    </div>
    ${rows}
  </div>`;
  renderIcons();
}

export async function loadDashboard() {
  const kpis = await apiGetKpis();
  if (!kpis) return;

  document.getElementById("kpi-total").textContent = kpis.total_problems;
  document.getElementById("kpi-open").textContent = kpis.open_problems;
  document.getElementById("kpi-progress").textContent = kpis.in_progress_problems;
  document.getElementById("kpi-completed").textContent = kpis.completed_problems;
  document.getElementById("kpi-rate").textContent = kpis.completion_rate + "%";
  document.getElementById("kpi-rate-bar").style.width = kpis.completion_rate + "%";
  document.getElementById("kpi-actions").textContent = kpis.total_actions;
  document.getElementById("kpi-overdue").textContent = kpis.overdue_actions;
  document.getElementById("kpi-action-rate").textContent = kpis.action_completion_rate + "%";
  document.getElementById("kpi-action-bar").style.width = kpis.action_completion_rate + "%";

  document.getElementById("seed-banner").style.display = kpis.total_problems === 0 ? "flex" : "none";

  // By priority
  const pDiv = document.getElementById("priority-chart");
  const priorities = ["critical", "high", "medium", "low"];
  const pColors = { critical: "#991b1b", high: "#dc2626", medium: "#d97706", low: "#16a34a" };
  const pLabels = { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" };
  const maxPVal = Math.max(...priorities.map(p => kpis.by_priority[p] || 0), 1);
  pDiv.innerHTML = priorities.map(p => {
    const val = kpis.by_priority[p] || 0;
    const pct = (val / maxPVal * 100);
    return `<div class="flex items-center gap-2 mb-2" style="font-size:13px">
      <span style="width:60px;color:var(--gray-600);font-weight:600">${pLabels[p]}</span>
      <div style="flex:1;height:10px;background:var(--gray-100);border-radius:9999px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${pColors[p]};border-radius:9999px;transition:width .6s"></div>
      </div>
      <span style="width:24px;text-align:right;font-weight:700;color:${pColors[p]}">${val}</span>
    </div>`;
  }).join("");

  // By area
  const aDiv = document.getElementById("area-chart");
  const areas = Object.entries(kpis.by_area);
  const maxAVal = Math.max(...areas.map(([, v]) => v), 1);
  aDiv.innerHTML = areas.length === 0
    ? `<div class="empty-state"><p>Sem dados ainda</p></div>`
    : areas.map(([area, val]) => {
      const pct = (val / maxAVal * 100);
      return `<div class="flex items-center gap-2 mb-2" style="font-size:13px">
        <span class="truncate" style="width:120px;color:var(--gray-600);font-weight:600">${area}</span>
        <div style="flex:1;height:10px;background:var(--gray-100);border-radius:9999px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:9999px;transition:width .6s"></div>
        </div>
        <span style="width:24px;text-align:right;font-weight:700;color:var(--primary)">${val}</span>
      </div>`;
    }).join("");

  // Restantes secções em paralelo
  const [monthly, upcoming, recent] = await Promise.all([
    apiGetMonthlyStats(),
    apiGetUpcomingActions(),
    apiGetProblems({ status: "open" }),
  ]);
  if (monthly) renderMonthlyChart(monthly);
  if (upcoming) renderAlertsPanel(upcoming);

  const recentEl = document.getElementById("recent-problems");
  if (recent && recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="check-circle-2"></i></div><p>Nenhum problema aberto</p></div>`;
  } else if (recent) {
    recentEl.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Título</th><th>Área</th><th>Responsável</th><th>Prioridade</th><th>Data</th></tr></thead>
      <tbody>${recent.slice(0, 8).map(p => `<tr style="cursor:pointer" data-action="open-detail" data-id="${p.id}">
        <td><span class="truncate" style="max-width:200px;display:block">${p.title}</span></td>
        <td>${p.area}</td>
        <td>${p.responsible}</td>
        <td>${badge(p.priority, PRIORITY_LABELS)}</td>
        <td>${formatDate(p.created_at)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }
  renderIcons();
}
