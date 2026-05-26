const API = "";

// ---- UTILITIES ----

async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro desconhecido");
    return data;
  } catch (e) {
    throw e;
  }
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function badge(val, map) {
  const label = map[val] || val;
  return `<span class="badge badge-${val}">${label}</span>`;
}

const STATUS_LABELS = { open: "Aberto", in_progress: "Em Progresso", completed: "Concluído", cancelled: "Cancelado", pending: "Pendente", overdue: "Atrasado" };
const PRIORITY_LABELS = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT");
}

function isOverdue(deadline, status) {
  if (status === "completed") return false;
  return new Date(deadline) < new Date();
}

function loading(id) {
  document.getElementById(id).innerHTML = `<div class="loading"><div class="spinner"></div> A carregar...</div>`;
}

// ---- NAV ----

function navigate(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelector(`[data-view="${view}"]`).classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    problems: "Problemas Kaizen",
    "new-problem": "Novo Problema",
    actions: "Tracker de Ações",
  };
  document.getElementById("topbar-title").textContent = titles[view] || view;

  if (view === "dashboard") loadDashboard();
  if (view === "problems") loadProblems();
  if (view === "actions") loadActions();
}

document.querySelectorAll(".nav-item[data-view]").forEach(item => {
  item.addEventListener("click", () => navigate(item.dataset.view));
});

// ---- DASHBOARD ----

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
  _monthlyChart = new Chart(ctx, {
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
            label: ctx => ` ${ctx.parsed.y} kaizen${ctx.parsed.y !== 1 ? "s" : ""}`,
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

    return `<div class="alert-item ${urgencyClass}" onclick="openProblemDetail(${a.problem_id})">
      <span class="alert-chip ${chipClass}">${chipLabel}</span>
      <div class="alert-info">
        <div class="alert-action-title">${a.title}</div>
        <div class="alert-meta">${a.problem_title} &middot; ${a.responsible}</div>
      </div>
      <span class="alert-deadline ${dlClass}">📅 ${dl}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="alerts-panel">
    <div class="alerts-panel-header">
      <span class="alerts-panel-icon">⚠️</span>
      <span class="alerts-panel-title">Ações com Prazo nos Próximos 7 Dias</span>
      <span class="alerts-panel-count">${actions.length}</span>
    </div>
    ${rows}
  </div>`;
}

async function loadDashboard() {
  const kpis = await apiFetch("/api/kpis");
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
  const pColors = { critical: "#7c3aed", high: "#dc2626", medium: "#d97706", low: "#16a34a" };
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

  // Fetch remaining sections in parallel
  const [monthly, upcoming, recent] = await Promise.all([
    apiFetch("/api/stats/monthly"),
    apiFetch("/api/actions/upcoming"),
    apiFetch("/api/problems?status=open"),
  ]);
  renderMonthlyChart(monthly);
  renderAlertsPanel(upcoming);
  const recentEl = document.getElementById("recent-problems");
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>Nenhum problema aberto</p></div>`;
  } else {
    recentEl.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Título</th><th>Área</th><th>Responsável</th><th>Prioridade</th><th>Data</th></tr></thead>
      <tbody>${recent.slice(0, 8).map(p => `<tr style="cursor:pointer" onclick="openProblemDetail(${p.id})">
        <td><span class="truncate" style="max-width:200px;display:block">${p.title}</span></td>
        <td>${p.area}</td>
        <td>${p.responsible}</td>
        <td>${badge(p.priority, PRIORITY_LABELS)}</td>
        <td>${formatDate(p.created_at)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }
}

// ---- PROBLEMS ----

let currentFilters = {};

async function loadProblems() {
  loading("problems-list");
  const params = new URLSearchParams(currentFilters);
  const problems = await apiFetch("/api/problems?" + params);
  renderProblemsTable(problems);
}

function renderProblemsTable(problems) {
  const el = document.getElementById("problems-list");
  if (problems.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhum problema encontrado</p></div>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>Título</th><th>Área</th><th>Responsável</th>
      <th>Prioridade</th><th>Estado</th><th>Data</th><th>Ações</th>
    </tr></thead>
    <tbody>${problems.map(p => `<tr>
      <td style="color:var(--gray-400);font-size:12px">#${p.id}</td>
      <td><span class="truncate" style="display:block;max-width:220px;cursor:pointer;font-weight:500;color:var(--primary)" onclick="openProblemDetail(${p.id})">${p.title}</span></td>
      <td>${p.area}</td>
      <td>${p.responsible}</td>
      <td>${badge(p.priority, PRIORITY_LABELS)}</td>
      <td>${badge(p.status, STATUS_LABELS)}</td>
      <td>${formatDate(p.created_at)}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary btn-icon" title="Ver detalhe" onclick="openProblemDetail(${p.id})">👁</button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="openEditProblem(${p.id})">✏️</button>
          <button class="btn btn-sm btn-danger btn-icon" title="Apagar" onclick="deleteProblem(${p.id})">🗑</button>
        </div>
      </td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

document.getElementById("filter-status").addEventListener("change", e => {
  if (e.target.value) currentFilters.status = e.target.value;
  else delete currentFilters.status;
  loadProblems();
});
document.getElementById("filter-priority").addEventListener("change", e => {
  if (e.target.value) currentFilters.priority = e.target.value;
  else delete currentFilters.priority;
  loadProblems();
});
document.getElementById("filter-area").addEventListener("input", e => {
  if (e.target.value.trim()) currentFilters.area = e.target.value.trim();
  else delete currentFilters.area;
  loadProblems();
});

// ---- NEW PROBLEM FORM ----

document.getElementById("problem-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = "A guardar...";
  try {
    const data = {
      title: document.getElementById("p-title").value,
      description: document.getElementById("p-description").value,
      area: document.getElementById("p-area").value,
      responsible: document.getElementById("p-responsible").value,
      priority: document.getElementById("p-priority").value,
    };
    await apiFetch("/api/problems", { method: "POST", body: JSON.stringify(data) });
    toast("Problema registado com sucesso!", "success");
    e.target.reset();
    navigate("problems");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Registar Problema";
  }
});

// ---- DELETE PROBLEM ----

async function deleteProblem(id) {
  if (!confirm("Tem a certeza que deseja apagar este problema? Esta ação é irreversível.")) return;
  try {
    await apiFetch(`/api/problems/${id}`, { method: "DELETE" });
    toast("Problema eliminado", "success");
    loadProblems();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---- EDIT PROBLEM MODAL ----

async function openEditProblem(id) {
  const p = await apiFetch(`/api/problems/${id}`);
  document.getElementById("edit-id").value = p.id;
  document.getElementById("edit-title").value = p.title;
  document.getElementById("edit-description").value = p.description;
  document.getElementById("edit-area").value = p.area;
  document.getElementById("edit-responsible").value = p.responsible;
  document.getElementById("edit-priority").value = p.priority;
  document.getElementById("edit-status").value = p.status;
  document.getElementById("modal-edit").classList.add("open");
}

document.getElementById("edit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await apiFetch(`/api/problems/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: document.getElementById("edit-title").value,
        description: document.getElementById("edit-description").value,
        area: document.getElementById("edit-area").value,
        responsible: document.getElementById("edit-responsible").value,
        priority: document.getElementById("edit-priority").value,
        status: document.getElementById("edit-status").value,
      }),
    });
    toast("Problema atualizado", "success");
    closeModal("modal-edit");
    loadProblems();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---- PROBLEM DETAIL ----

let currentProblemId = null;

async function openProblemDetail(id) {
  currentProblemId = id;
  const p = await apiFetch(`/api/problems/${id}`);
  const modal = document.getElementById("modal-detail");
  document.getElementById("detail-title").textContent = p.title;
  document.getElementById("detail-badges").innerHTML = `${badge(p.status, STATUS_LABELS)} ${badge(p.priority, PRIORITY_LABELS)}`;

  document.getElementById("detail-info").innerHTML = `
    <div class="info-row">
      <div class="info-item"><span class="info-label">Área</span><span class="info-value">${p.area}</span></div>
      <div class="info-item"><span class="info-label">Responsável</span><span class="info-value">${p.responsible}</span></div>
      <div class="info-item"><span class="info-label">Criado em</span><span class="info-value">${formatDate(p.created_at)}</span></div>
      <div class="info-item"><span class="info-label">Atualizado em</span><span class="info-value">${formatDate(p.updated_at)}</span></div>
    </div>
    <div style="font-size:14px;color:var(--gray-700);line-height:1.6">${p.description}</div>`;

  // 5W1H
  const w5el = document.getElementById("detail-5w1h");
  if (p.analysis_5w1h) {
    try {
      const a = JSON.parse(p.analysis_5w1h);
      render5W1H(w5el, a);
    } catch { w5el.innerHTML = `<p class="text-sm text-gray">Análise salva em formato inválido.</p>`; }
  } else {
    w5el.innerHTML = `<div class="empty-state" style="padding:20px">
      <p>Análise 5W1H ainda não gerada.</p>
      <button class="btn btn-primary mt-2" onclick="generate5W1H()">✨ Gerar com IA</button>
    </div>`;
  }

  // A3
  const a3el = document.getElementById("detail-a3");
  if (p.a3_report) {
    try {
      const r = JSON.parse(p.a3_report);
      renderA3(a3el, r);
    } catch { a3el.innerHTML = `<p class="text-sm text-gray">Relatório A3 guardado em formato inválido.</p>`; }
  } else {
    a3el.innerHTML = `<div class="empty-state" style="padding:20px">
      <p>Relatório A3 ainda não gerado.</p>
      <button class="btn btn-primary mt-2" onclick="generateA3()">✨ Gerar com IA</button>
    </div>`;
  }

  // Suggestions — always start with empty-state button
  document.getElementById("detail-suggestions").innerHTML = `<div class="empty-state" style="padding:20px">
    <p>Sugestões de melhoria ainda não geradas.</p>
    <button class="btn btn-primary mt-2" onclick="generateSuggestions()">✨ Gerar com IA</button>
  </div>`;

  // Actions
  await loadDetailActions(id);

  modal.classList.add("open");
}

async function loadDetailActions(problemId) {
  const actions = await apiFetch(`/api/actions?problem_id=${problemId}`);
  const el = document.getElementById("detail-actions");
  const toolbarBtns = `<div class="flex gap-2" style="margin-bottom:12px">
    <button class="btn btn-sm btn-primary" onclick="openAddAction(${problemId})">+ Adicionar Ação</button>
    <button class="btn btn-sm btn-secondary" id="btn-suggest-actions" onclick="generateAIActions(${problemId})">✨ Sugerir com IA</button>
  </div>`;
  if (actions.length === 0) {
    el.innerHTML = `${toolbarBtns}<div class="empty-state" style="padding:16px"><p>Nenhuma ação registada</p></div>`;
    return;
  }
  el.innerHTML = toolbarBtns + actions.map(a => {
    const over = isOverdue(a.deadline, a.status);
    const done = a.status === "completed";
    return `<div class="action-card">
      <div class="action-check ${done ? "done" : ""}" onclick="toggleAction(${a.id}, '${done ? "pending" : "completed"}')">
        ${done ? "✓" : ""}
      </div>
      <div class="action-info">
        <div class="action-title" style="${done ? "text-decoration:line-through;color:var(--gray-400)" : ""}">${a.title}</div>
        <div class="action-meta">${a.responsible} • ${badge(a.status, STATUS_LABELS)}</div>
      </div>
      <div>
        <div class="action-deadline ${over ? "overdue" : ""}">📅 ${a.deadline}</div>
      </div>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteAction(${a.id}, ${problemId})">🗑</button>
    </div>`;
  }).join("");
}

async function toggleAction(actionId, newStatus) {
  try {
    await apiFetch(`/api/actions/${actionId}`, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
    if (currentProblemId) loadDetailActions(currentProblemId);
  } catch (err) { toast(err.message, "error"); }
}

async function deleteAction(actionId, problemId) {
  if (!confirm("Apagar esta ação?")) return;
  try {
    await apiFetch(`/api/actions/${actionId}`, { method: "DELETE" });
    toast("Ação eliminada", "success");
    loadDetailActions(problemId);
  } catch (err) { toast(err.message, "error"); }
}

async function generateAIActions(problemId) {
  const btn = document.getElementById("btn-suggest-actions");
  if (btn) { btn.disabled = true; btn.textContent = "A gerar..."; }
  const suggestionsEl = document.getElementById("detail-ai-action-suggestions");
  const container = suggestionsEl || (() => {
    const div = document.createElement("div");
    div.id = "detail-ai-action-suggestions";
    document.getElementById("detail-actions").appendChild(div);
    return div;
  })();
  container.innerHTML = `<div class="loading" style="margin:12px 0"><div class="spinner"></div> A gerar sugestões de ações com IA...</div>`;
  try {
    const result = await apiFetch(`/api/problems/${problemId}/suggest_actions`, { method: "POST" });
    renderAISuggestedActions(container, result.actions || [], problemId);
    toast("Sugestões de ações geradas!", "success");
  } catch (err) {
    container.innerHTML = `<div class="loading" style="color:var(--danger);margin:12px 0">Erro: ${err.message}</div>
      <button class="btn btn-sm btn-secondary" onclick="generateAIActions(${problemId})" style="margin-bottom:12px">Tentar novamente</button>`;
    toast(err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✨ Sugerir com IA"; }
  }
}

let _aiSuggestedActions = [];

function renderAISuggestedActions(el, actions, problemId) {
  if (!actions.length) { el.innerHTML = ""; return; }
  _aiSuggestedActions = actions;
  const today = new Date();
  el.innerHTML = `
    <div class="a3-section" style="margin-top:12px">
      <div class="a3-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>✨ Ações Sugeridas pela IA</span>
        <button class="btn btn-sm btn-secondary" onclick="this.closest('.a3-section').remove()">✕ Fechar</button>
      </div>
      ${actions.map((a, i) => {
        const deadline = new Date(today);
        deadline.setDate(deadline.getDate() + (a.deadline_days || 7));
        const deadlineStr = deadline.toISOString().split("T")[0];
        return `<div class="action-card" style="background:var(--gray-50)" id="ai-action-card-${i}">
          <div class="action-info" style="flex:1">
            <div class="action-title">${a.title}</div>
            <div class="action-meta" style="font-size:12px;color:var(--gray-500)">${a.description || ""}</div>
            <div class="action-meta">${a.responsible} • 📅 ${deadlineStr}</div>
          </div>
          <button class="btn btn-sm btn-primary" id="ai-action-btn-${i}" onclick="addSuggestedAction(${problemId}, ${i}, '${deadlineStr}')">+ Adicionar</button>
        </div>`;
      }).join("")}
    </div>`;
}

async function addSuggestedAction(problemId, index, deadline) {
  const btn = document.getElementById(`ai-action-btn-${index}`);
  const action = _aiSuggestedActions[index];
  if (!action || !btn) return;
  btn.disabled = true;
  btn.textContent = "A adicionar...";
  try {
    await apiFetch("/api/actions", {
      method: "POST",
      body: JSON.stringify({
        problem_id: problemId,
        title: action.title,
        description: action.description || "",
        responsible: action.responsible,
        deadline,
      }),
    });
    toast("Ação adicionada!", "success");
    btn.textContent = "✓ Adicionada";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-secondary");
    await loadDetailActions(problemId);
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.textContent = "+ Adicionar";
  }
}

function openAddAction(problemId) {
  document.getElementById("action-problem-id").value = problemId;
  document.getElementById("modal-action").classList.add("open");
}

document.getElementById("action-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const problemId = parseInt(document.getElementById("action-problem-id").value);
    await apiFetch("/api/actions", {
      method: "POST",
      body: JSON.stringify({
        problem_id: problemId,
        title: document.getElementById("action-title").value,
        description: document.getElementById("action-desc").value,
        responsible: document.getElementById("action-responsible").value,
        deadline: document.getElementById("action-deadline").value,
      }),
    });
    toast("Ação adicionada!", "success");
    e.target.reset();
    closeModal("modal-action");
    loadDetailActions(problemId);
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---- AI: 5W1H ----

async function generate5W1H() {
  const el = document.getElementById("detail-5w1h");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar análise 5W1H com IA...</div>`;
  try {
    const analysis = await apiFetch(`/api/problems/${currentProblemId}/analyze`, { method: "POST" });
    render5W1H(el, analysis);
    toast("Análise 5W1H gerada!", "success");
  } catch (err) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Erro: ${err.message}</div>
      <button class="btn btn-primary" onclick="generate5W1H()" style="margin:12px auto;display:block">Tentar novamente</button>`;
    toast(err.message, "error");
  }
}

function render5W1H(el, a) {
  const fields = [
    ["O Quê (What)", a.what],
    ["Porquê (Why)", a.why],
    ["Onde (Where)", a.where],
    ["Quando (When)", a.when],
    ["Quem (Who)", a.who],
    ["Como (How)", a.how],
  ];
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="ai-badge">✨ Gerado por IA</span>
      <button class="btn btn-sm btn-secondary" onclick="generate5W1H()">↻ Regenerar</button>
    </div>
    <div class="w5h1-grid">${fields.map(([l, v]) => `
      <div class="w5h1-item">
        <div class="w5h1-label">${l}</div>
        <div class="w5h1-text">${v || "—"}</div>
      </div>`).join("")}</div>
    ${a.root_causes ? `
      <div class="a3-section">
        <div class="a3-section-title">Causas Raiz Identificadas</div>
        <ul style="margin:0;padding-left:18px">${a.root_causes.map(c => `<li class="text-sm" style="margin-bottom:4px">${c}</li>`).join("")}</ul>
      </div>` : ""}
    ${a.immediate_actions ? `
      <div class="a3-section">
        <div class="a3-section-title">Ações Imediatas Sugeridas</div>
        <ul style="margin:0;padding-left:18px">${a.immediate_actions.map(c => `<li class="text-sm" style="margin-bottom:4px">${c}</li>`).join("")}</ul>
      </div>` : ""}
    ${a.suggested_solutions ? `
      <div class="a3-section">
        <div class="a3-section-title">Soluções Propostas</div>
        <ul style="margin:0;padding-left:18px">${a.suggested_solutions.map(c => `<li class="text-sm" style="margin-bottom:4px">${c}</li>`).join("")}</ul>
      </div>` : ""}`;
}

// ---- AI: A3 ----

let _currentA3Report = null;

async function generateA3() {
  const el = document.getElementById("detail-a3");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar relatório A3 com IA...</div>`;
  try {
    const report = await apiFetch(`/api/problems/${currentProblemId}/a3`, { method: "POST" });
    renderA3(el, report);
    toast("Relatório A3 gerado!", "success");
  } catch (err) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Erro: ${err.message}</div>
      <button class="btn btn-primary" onclick="generateA3()" style="margin:12px auto;display:block">Tentar novamente</button>`;
    toast(err.message, "error");
  }
}

function renderA3(el, r) {
  _currentA3Report = r;
  const h = r.header || {};
  const rca = r.root_cause_analysis || {};
  const fishbone = rca.fishbone || {};
  const fiveWhys = rca.five_whys || [];
  const countermeasures = r.countermeasures || [];
  const plan = r.implementation_plan || [];
  const follow = r.follow_up || {};

  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="ai-badge">✨ Relatório A3 - IA</span>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-secondary" onclick="generateA3()">↻ Regenerar</button>
        <button class="btn btn-sm btn-primary" onclick="exportA3PDF()">⬇ Exportar PDF</button>
      </div>
    </div>
    <div class="a3-section" style="background:var(--primary-light);border-color:var(--primary)">
      <div class="a3-section-title" style="color:var(--primary-dark)">Cabeçalho</div>
      <div class="info-row">
        <div class="info-item"><span class="info-label">Título</span><span class="info-value">${h.titulo || "—"}</span></div>
        <div class="info-item"><span class="info-label">Responsável</span><span class="info-value">${h.responsavel || "—"}</span></div>
        <div class="info-item"><span class="info-label">Área</span><span class="info-value">${h.area || "—"}</span></div>
        <div class="info-item"><span class="info-label">Revisão</span><span class="info-value">${h.revisao || "Rev. 01"}</span></div>
      </div>
    </div>
    <div class="grid-2" style="gap:14px;margin-bottom:14px">
      <div class="a3-section"><div class="a3-section-title">Contexto/Justificativa</div><div class="a3-text">${r.background || "—"}</div></div>
      <div class="a3-section"><div class="a3-section-title">Estado Atual</div><div class="a3-text">${r.current_state || "—"}</div></div>
    </div>
    <div class="a3-section"><div class="a3-section-title">Estado Futuro (Meta)</div><div class="a3-text">${r.target_state || "—"}</div></div>
    <div class="a3-section">
      <div class="a3-section-title">Análise de Causa Raiz — Diagrama Ishikawa</div>
      <div class="fishbone-grid">${
        Object.entries({ "Máquina": fishbone.maquina, "Método": fishbone.metodo, "Material": fishbone.material, "Mão de Obra": fishbone.mao_de_obra, "Medição": fishbone.medicao, "Meio Ambiente": fishbone.meio_ambiente })
          .map(([cat, items]) => `<div class="fishbone-cat">
            <div class="fishbone-cat-title">${cat}</div>
            <ul>${(items || []).map(i => `<li>${i}</li>`).join("")}</ul>
          </div>`).join("")
      }</div>
    </div>
    <div class="a3-section">
      <div class="a3-section-title">5 Porquês</div>
      <div class="five-whys">${fiveWhys.map((w, i) => `
        <div class="why-item">
          <div class="why-num">${i + 1}</div>
          <div class="why-content">
            <div class="why-q">${w.why || ""}</div>
            <div class="why-a">${w.answer || ""}</div>
          </div>
        </div>`).join("")}</div>
      ${rca.root_cause ? `<div class="mt-3 a3-section" style="background:#fff4f4;border-color:var(--danger)">
        <div class="a3-section-title" style="color:var(--danger)">Causa Raiz Principal</div>
        <div class="a3-text font-bold">${rca.root_cause}</div>
      </div>` : ""}
    </div>
    <div class="a3-section">
      <div class="a3-section-title">Contramedidas / Plano de Ação</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Indicador</th></tr></thead>
        <tbody>${countermeasures.map(c => `<tr>
          <td>${c.acao || "—"}</td>
          <td>${c.responsavel || "—"}</td>
          <td>${c.prazo || "—"}</td>
          <td>${c.indicador || "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="a3-section">
      <div class="a3-section-title">Plano de Implementação</div>
      ${plan.map(s => `<div style="margin-bottom:10px">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">${s.etapa} <span style="color:var(--gray-400);font-size:12px">— ${s.responsavel} | ${s.prazo}</span></div>
        <ul style="padding-left:18px">${(s.atividades || []).map(a => `<li class="text-sm">${a}</li>`).join("")}</ul>
      </div>`).join("")}
    </div>
    <div class="grid-2" style="gap:14px">
      <div class="a3-section">
        <div class="a3-section-title">Acompanhamento</div>
        <div class="text-sm"><b>Indicadores:</b> ${(follow.indicadores || []).join(", ")}</div>
        <div class="text-sm mt-1"><b>Frequência:</b> ${follow.frequencia_revisao || "—"}</div>
        <div class="text-sm mt-1"><b>Critério de sucesso:</b> ${follow.criterio_sucesso || "—"}</div>
      </div>
      <div class="a3-section">
        <div class="a3-section-title">Lições Aprendidas</div>
        <div class="a3-text">${r.lessons_learned || "—"}</div>
      </div>
    </div>`;
}

// ---- EXPORT A3 PDF ----

async function exportA3PDF() {
  if (!_currentA3Report) return;

  const btn = document.querySelector("button[onclick='exportA3PDF()']");
  if (btn) { btn.disabled = true; btn.textContent = 'A gerar PDF...'; }

  try {
    if (!window.jspdf) throw new Error('jsPDF não carregado. Verifica a ligação à internet.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const r   = _currentA3Report;
    const h   = r.header || {};
    const rca = r.root_cause_analysis || {};
    const fb  = rca.fishbone || {};
    const fiveWhys      = rca.five_whys    || [];
    const countermeasures = r.countermeasures || [];
    const plan   = r.implementation_plan || [];
    const follow = r.follow_up || {};
    const problemTitle = document.getElementById('detail-title')?.textContent || h.titulo || 'relatorio_a3';

    // ── Layout ───────────────────────────────────────────────────────────
    const PW = 210, PH = 297, ML = 11, MR = 11, MB = 12;
    const CW = PW - ML - MR;   // 188 mm usable width
    const GAP = 2.5;            // gap between columns
    const PAD = 3;              // inner padding inside boxes
    let y = 11;

    // ── Palette ───────────────────────────────────────────────────────────
    const K = {
      primary: [26,  86, 219], danger:  [220, 38,  38], success: [22, 163,  74],
      warning: [217, 119,  6], purple:  [124, 58, 237], cyan:    [14, 165, 233],
      slate:   [71,  85, 105], text:    [51,  65,  85], muted:   [100, 116, 139],
      border:  [226, 232, 240], bg:     [248, 250, 252], white:  [255, 255, 255],
    };

    // Line-height in mm for each font size (pt).
    // Values are deliberately ~30% above jsPDF's internal spacing to guarantee
    // that box heights never undercut the actual rendered text height.
    const LH = { 7:3.8, 7.5:4.1, 8:4.5, 8.5:4.8, 9:5.2, 9.5:5.5, 10:5.8, 14:7.5 };
    const lh = fs => LH[fs] ?? fs * 0.42;

    // ── Core helpers ─────────────────────────────────────────────────────

    function guard(need) {
      if (y + need > PH - MB) { doc.addPage(); y = 11; }
    }

    // FIX: always set font+size BEFORE splitTextToSize so character-width
    // calculations match the font that will actually be used for rendering.
    function measure(text, maxW, fs = 9, style = 'normal') {
      doc.setFont('helvetica', style);
      doc.setFontSize(fs);
      return doc.splitTextToSize(String(text || '—'), maxW);
    }

    function fill(x, ry, w, rh, color) {
      doc.setFillColor(...color); doc.rect(x, ry, w, rh, 'F');
    }
    function stroke(x, ry, w, rh, color = K.border) {
      doc.setDrawColor(...color); doc.setLineWidth(0.25); doc.rect(x, ry, w, rh, 'S');
    }
    // Coloured label bar — draws at absolute coords, does NOT advance y
    function barAt(label, color, bx, by, bw) {
      fill(bx, by, bw, 6, color);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...K.white);
      doc.text(label, bx + PAD, by + 4.2);
      doc.setTextColor(0, 0, 0);
    }
    // Full-width label bar — advances y by 7
    function bar(label, color) {
      guard(12);
      barAt(label, color, ML, y, CW);
      y += 7;
    }

    // ── 1. Page header ────────────────────────────────────────────────────
    guard(28);
    fill(ML, y, CW, 24, K.primary);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...K.white);
    doc.text('RELATÓRIO A3 — KAIZEN', ML + PAD + 1, y + 8);
    doc.setFontSize(10);
    // measure() sets font to 10pt bold so splitTextToSize is accurate
    doc.text(measure(h.titulo || problemTitle, CW - PAD * 2, 10, 'bold')[0] || '', ML + PAD + 1, y + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(
      `Responsável: ${h.responsavel || '—'}   |   Área: ${h.area || '—'}   |   Revisão: ${h.revisao || 'Rev. 01'}   |   Data: ${new Date().toLocaleDateString('pt-PT')}`,
      ML + PAD + 1, y + 21.5
    );
    doc.setTextColor(0, 0, 0);
    y += 27;

    // ── 2. Three columns: Contexto / Estado Atual / Estado Futuro ─────────
    const cW = (CW - GAP * 2) / 3;   // ≈ 61 mm each
    const textW3 = cW - PAD * 2;      // ≈ 55 mm — max text width inside each column
    const colDefs = [
      { label: '1. Contexto / Justificativa', color: K.primary, text: r.background,    x: ML },
      { label: '2. Estado Atual',             color: K.danger,  text: r.current_state, x: ML + cW + GAP },
      { label: '3. Estado Futuro (Meta)',      color: K.success, text: r.target_state,  x: ML + (cW + GAP) * 2 },
    ];
    // measure() at 8.5pt — must match rendering font so wrapping is accurate
    const colLines = colDefs.map(c => measure(c.text, textW3, 8.5));
    const maxCL   = Math.max(...colLines.map(l => l.length));
    const cBodyH  = maxCL * lh(8.5) + PAD * 2;
    const cBoxH   = 6 + 1 + cBodyH;   // bar(6) + gap(1) + body

    guard(cBoxH + 5);
    const col3Y = y;
    colDefs.forEach(c => { stroke(c.x, col3Y, cW, cBoxH); barAt(c.label, c.color, c.x, col3Y, cW); });
    const col3TextY = col3Y + 6 + 1 + PAD + 1; // baseline: bar + gap + pad + 1mm font-ascent offset
    doc.setTextColor(...K.text);
    colDefs.forEach((c, i) => doc.text(colLines[i], c.x + PAD, col3TextY));
    y = col3Y + cBoxH + 5;

    // ── 3. Ishikawa fishbone ─────────────────────────────────────────────
    const fbCats = [
      ['Máquina',       fb.maquina],     ['Método',        fb.metodo],
      ['Material',      fb.material],    ['Mão de Obra',   fb.mao_de_obra],
      ['Medição',       fb.medicao],     ['Meio Ambiente', fb.meio_ambiente],
    ];
    const fbCW  = (CW - GAP * 2) / 3;
    const fbXs  = [ML, ML + fbCW + GAP, ML + (fbCW + GAP) * 2];
    const fbTW  = fbCW - PAD * 2;        // text width inside fishbone cell

    // Row height: sum of all item line counts × lh, plus header + padding
    function fbRowH(slice) {
      const maxItemH = Math.max(...slice.map(([, items]) => {
        if (!items?.length) return lh(8);
        // measure each item at 8pt to get accurate line count
        return items.reduce((sum, item) => sum + measure(item, fbTW, 8).length * lh(8), 0);
      }));
      return maxItemH + 13; // 6 bar + 1 gap + PAD + 3 bottom pad
    }
    function drawFbRow(slice, rowH) {
      guard(rowH + 2);
      const ry = y;
      slice.forEach(([cat, items], i) => {
        stroke(fbXs[i], ry, fbCW, rowH);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...K.purple);
        doc.text(cat.toUpperCase(), fbXs[i] + PAD, ry + 4.5);
        let itemY = ry + 10;
        (items || []).forEach(item => {
          // measure() sets 8pt normal — wraps correctly within the cell
          const lines = measure(item, fbTW, 8);
          doc.setTextColor(...K.text);
          doc.text(lines, fbXs[i] + PAD, itemY);
          itemY += lines.length * lh(8);
        });
        if (!items?.length) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          doc.setTextColor(...K.muted); doc.text('—', fbXs[i] + PAD, ry + 10);
        }
      });
      doc.setTextColor(0, 0, 0);
      y = ry + rowH + 2;
    }

    bar('4. Análise de Causa Raiz — Diagrama Ishikawa (6M)', K.purple);
    drawFbRow(fbCats.slice(0, 3), fbRowH(fbCats.slice(0, 3)));
    drawFbRow(fbCats.slice(3, 6), fbRowH(fbCats.slice(3, 6)));
    y += 3;

    // ── 4. Five Whys ──────────────────────────────────────────────────────
    bar('5. Análise dos 5 Porquês', K.warning);
    const wyW = CW - 10 - PAD; // text width: subtract badge(6.5) + gap(3.5)

    fiveWhys.forEach((w, i) => {
      const qL = measure(w.why    || '', wyW, 9, 'bold');
      const aL = measure(w.answer || '', wyW, 8.5);
      const blockH = qL.length * lh(9) + aL.length * lh(8.5) + 9;
      guard(blockH + 2);
      fill(ML, y, 6.5, 6.5, K.warning);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...K.white);
      doc.text(String(i + 1), ML + (i < 9 ? 2.3 : 1.3), y + 4.8);
      // qL was measured at 9pt bold — font is already set, just set color
      doc.setTextColor(...K.text);
      doc.text(qL, ML + 10, y + 4.8);
      // aL was measured at 8.5pt normal — measure() call above set it; re-set for clarity
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...K.muted);
      doc.text(aL, ML + 10, y + 4.8 + qL.length * lh(9) + 1);
      doc.setTextColor(0, 0, 0);
      y += blockH + 1;
    });

    if (rca.root_cause) {
      const rcL = measure(rca.root_cause, CW - PAD * 2, 9.5, 'bold');
      const rcH = 6 + 1 + PAD + rcL.length * lh(9.5) + PAD;
      guard(rcH + 3);
      fill(ML, y, CW, rcH, [255, 243, 243]);
      stroke(ML, y, CW, rcH, K.danger);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...K.danger);
      doc.text('CAUSA RAIZ PRINCIPAL', ML + PAD, y + 4.5);
      // rcL measured at 9.5pt bold — font already set by measure()
      doc.setTextColor(...K.text);
      doc.text(rcL, ML + PAD, y + 11);
      y += rcH + 4;
    }

    // ── 5. Countermeasures ────────────────────────────────────────────────
    bar('6. Contramedidas / Plano de Ação', K.cyan);

    if (doc.autoTable && countermeasures.length) {
      doc.autoTable({
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Ação', 'Responsável', 'Prazo', 'Indicador']],
        body: countermeasures.map(c => [c.acao || '—', c.responsavel || '—', c.prazo || '—', c.indicador || '—']),
        styles: { fontSize: 8.5, cellPadding: 2.5, textColor: K.text, lineColor: K.border, lineWidth: 0.25 },
        headStyles: { fillColor: K.cyan, textColor: K.white, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: K.bg },
        columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 36 }, 2: { cellWidth: 25 }, 3: { cellWidth: 'auto' } },
      });
      y = doc.lastAutoTable.finalY + 5;
    } else {
      countermeasures.forEach(c => {
        const l = measure(`• ${c.acao || '—'}  [${c.responsavel || '—'} · ${c.prazo || '—'}]  ${c.indicador || ''}`, CW - PAD, 8.5);
        guard(l.length * lh(8.5) + 3);
        doc.setTextColor(...K.text);
        doc.text(l, ML + PAD, y); y += l.length * lh(8.5) + 2;
      });
      y += 3;
    }

    // ── 6. Implementation plan ────────────────────────────────────────────
    bar('7. Plano de Implementação', K.slate);
    const planTW  = CW - 10 - PAD;  // text width (subtract badge + gap)

    plan.forEach((step, i) => {
      const titleL  = measure(step.etapa || `Etapa ${i + 1}`, planTW, 9, 'bold');
      const actLines = (step.atividades || []).flatMap(a => measure(`• ${a}`, planTW, 8));
      const hasMeta = !!(step.responsavel || step.prazo);
      const blockH  = titleL.length * lh(9) + (hasMeta ? lh(7.5) + 1.5 : 0) + actLines.length * lh(8) + 5;
      guard(blockH);

      fill(ML, y, 6, 5.5, K.slate);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...K.white);
      doc.text(String(i + 1), ML + 1.3, y + 4);
      // titleL measured at 9pt bold — font already set
      doc.setTextColor(...K.text);
      doc.text(titleL, ML + 9, y + 4);
      y += titleL.length * lh(9) + 1;

      if (hasMeta) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...K.muted);
        doc.text(`${step.responsavel || ''}${step.prazo ? ' · ' + step.prazo : ''}`, ML + 9, y + 1);
        y += lh(7.5) + 2;
      }

      // actLines measured at 8pt normal — font already set from last measure()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...K.text);
      actLines.forEach(line => { guard(lh(8) + 1); doc.text(line, ML + 9, y); y += lh(8); });
      y += 4;
    });

    // ── 7. Follow-up + Lessons (two columns) ─────────────────────────────
    const hW   = (CW - GAP) / 2;   // ≈ 92.75 mm each
    const hTW  = hW - PAD * 2;     // ≈ 86.75 mm text width — critical for no overflow
    const h8x  = ML;
    const h9x  = ML + hW + GAP;

    // measure() at 9pt ensures splitTextToSize uses the same font as rendering
    const followLines = [
      ...(follow.indicadores?.length ? measure(`Indicadores: ${follow.indicadores.join(', ')}`, hTW, 9) : []),
      ...(follow.frequencia_revisao   ? measure(`Frequência: ${follow.frequencia_revisao}`,             hTW, 9) : []),
      ...(follow.criterio_sucesso     ? measure(`Critério: ${follow.criterio_sucesso}`,                 hTW, 9) : []),
    ];
    const lessonLines = measure(r.lessons_learned, hTW, 9);
    const dH = 6 + 1 + PAD + Math.max(followLines.length || 1, lessonLines.length) * lh(9) + PAD;

    guard(dH + 4);
    const duoY = y;
    stroke(h8x, duoY, hW, dH); stroke(h9x, duoY, hW, dH);
    barAt('8. Acompanhamento',    K.primary, h8x, duoY, hW);
    barAt('9. Lições Aprendidas', K.success, h9x, duoY, hW);
    const duoTY = duoY + 6 + 1 + PAD + 1;
    doc.setTextColor(...K.text);
    doc.text(followLines.length ? followLines : ['—'], h8x + PAD, duoTY);
    doc.text(lessonLines,                              h9x + PAD, duoTY);
    y = duoY + dH + 4;

    // ── Footer on every page ──────────────────────────────────────────────
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...K.muted);
      doc.text(`Kaizen Assistant — Gerado em ${new Date().toLocaleString('pt-PT')}`, ML, PH - 6);
      doc.text(`Pág. ${p} / ${pages}`, PW - MR, PH - 6, { align: 'right' });
    }

    const safeName = problemTitle.replace(/[^\w\sÀ-ÿ]/g, '').replace(/\s+/g, '_').slice(0, 50);
    doc.save(`A3_${safeName || 'relatorio'}.pdf`);

  } catch (err) {
    toast('Erro ao gerar PDF: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Exportar PDF'; }
  }
}

// ---- AI: SUGGESTIONS ----

async function generateSuggestions() {
  if (!currentProblemId) return;
  const el = document.getElementById("detail-suggestions");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar sugestões de melhoria...</div>`;
  try {
    const s = await apiFetch(`/api/problems/${currentProblemId}/suggestions`, { method: "POST" });
    renderSuggestions(el, s);
    toast("Sugestões geradas!", "success");
  } catch (err) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Erro: ${err.message}</div>
      <button class="btn btn-primary" onclick="generateSuggestions()" style="margin:12px auto;display:block">Tentar novamente</button>`;
  }
}

function renderSuggestions(el, s) {
  const cols = [
    { key: "quick_wins", label: "Quick Wins (≤1 semana)", cls: "quick" },
    { key: "medium_term", label: "Médio Prazo (1-3 meses)", cls: "medium" },
    { key: "long_term", label: "Longo Prazo (3+ meses)", cls: "long" },
  ];
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="ai-badge">✨ Sugestões por IA</span>
      <button class="btn btn-sm btn-secondary" onclick="generateSuggestions()">↻ Regenerar</button>
    </div>
    <div class="suggestions-grid">${cols.map(col => `
      <div>
        <div class="suggestion-col-title ${col.cls}">${col.label}</div>
        ${(s[col.key] || []).map(item => `
          <div class="suggestion-item">
            <div class="suggestion-title">${item.titulo}</div>
            <div class="suggestion-desc">${item.descricao}</div>
            <div class="suggestion-meta">
              <span class="meta-tag impacto-${item.impacto}">Impacto: ${item.impacto}</span>
              <span class="meta-tag esforco-${item.esforco}">Esforço: ${item.esforco}</span>
            </div>
          </div>`).join("")}
      </div>`).join("")}</div>
    ${s.benchmarks ? `<div class="a3-section"><div class="a3-section-title">Benchmarks & Boas Práticas</div><div class="a3-text">${s.benchmarks}</div></div>` : ""}
    ${s.kpis_sugeridos ? `<div class="a3-section"><div class="a3-section-title">KPIs Sugeridos</div>
      <div class="flex gap-2 flex-wrap">${s.kpis_sugeridos.map(k => `<span class="badge badge-open">${k}</span>`).join("")}</div>
    </div>` : ""}`;
}

// ---- ACTIONS VIEW ----

async function loadActions() {
  loading("actions-list");
  const statusFilter = document.getElementById("action-filter-status")?.value;
  let url = "/api/actions";
  if (statusFilter) url += `?status=${statusFilter}`;
  const actions = await apiFetch(url);
  renderActionsTable(actions);
}

function renderActionsTable(actions) {
  const el = document.getElementById("actions-list");
  if (actions.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>Nenhuma ação encontrada</p></div>`;
    return;
  }
  const today = new Date();
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>Título</th><th>Problema</th><th>Responsável</th>
      <th>Prazo</th><th>Estado</th><th>Ações</th>
    </tr></thead>
    <tbody>${actions.map(a => {
      const over = isOverdue(a.deadline, a.status);
      return `<tr>
        <td style="color:var(--gray-400);font-size:12px">#${a.id}</td>
        <td><span style="font-weight:500">${a.title}</span></td>
        <td><a href="#" onclick="openProblemDetail(${a.problem_id});return false" style="color:var(--primary);font-size:13px">#${a.problem_id}</a></td>
        <td>${a.responsible}</td>
        <td class="${over ? "text-danger" : ""}" style="${over ? "color:var(--danger);font-weight:600" : ""}">${a.deadline}${over ? " ⚠️" : ""}</td>
        <td>${badge(a.status, STATUS_LABELS)}</td>
        <td>
          <div class="flex gap-2">
            ${a.status !== "completed" ? `<button class="btn btn-sm btn-success btn-icon" title="Marcar concluída" onclick="toggleAction(${a.id},'completed');loadActions()">✓</button>` : `<button class="btn btn-sm btn-secondary btn-icon" onclick="toggleAction(${a.id},'pending');loadActions()">↩</button>`}
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteActionGlobal(${a.id})">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function exportActionsExcel() {
  const statusFilter = document.getElementById("action-filter-status")?.value;
  let url = "/api/actions/export";
  if (statusFilter) url += `?status=${statusFilter}`;
  window.location.href = url;
}

async function deleteActionGlobal(id) {
  if (!confirm("Apagar esta ação?")) return;
  try {
    await apiFetch(`/api/actions/${id}`, { method: "DELETE" });
    toast("Ação eliminada", "success");
    loadActions();
  } catch (err) { toast(err.message, "error"); }
}

document.getElementById("action-filter-status")?.addEventListener("change", loadActions);

// ---- MODAL UTILS ----

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

document.querySelectorAll(".modal-overlay").forEach(m => {
  m.addEventListener("click", e => {
    if (e.target === m) m.classList.remove("open");
  });
});

document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});

// ---- TABS inside detail modal ----

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.tabGroup;
    const target = btn.dataset.tab;
    document.querySelectorAll(`.tab-btn[data-tab-group="${group}"]`).forEach(b => b.classList.remove("active"));
    document.querySelectorAll(`.tab-pane[data-tab-group="${group}"]`).forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`.tab-pane[data-tab-group="${group}"][data-tab="${target}"]`).classList.add("active");
  });
});

// ---- SEED ----

async function seedDatabase() {
  const btn = document.getElementById("btn-seed");
  if (btn) { btn.disabled = true; btn.textContent = "A carregar..."; }

  try {
    const res = await apiFetch("/api/seed", { method: "POST" });
    toast(res.message, "success");
    loadDashboard();
  } catch (err) {
    toast("Erro ao carregar dados: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🏭 Carregar Dados de Exemplo"; }
  }
}

// ---- INIT ----

navigate("dashboard");
