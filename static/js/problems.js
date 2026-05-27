// ============================================================================
// problems.js — tabela e filtros, modal de detalhe + tabs (5W1H, A3, sugestões,
// ações), geração por IA, exportação A3 em PDF.
//
// Notas:
//  - `loadDetailActions` é exportada porque o action-form submit (em main.js)
//    precisa de refrescar o detalhe após criar uma ação.
//  - `toggleAction` vive aqui porque depende de `currentProblemId` (estado do
//    detalhe). Na vista global de ações, main.js encadeia com `loadActions()`.
// ============================================================================
import {
  apiGetProblems, apiGetProblem, apiDeleteProblem,
  apiGetActionsForProblem, apiCreateAction, apiUpdateAction, apiDeleteAction,
  apiAnalyze5W1H, apiGenerateA3, apiGenerateSuggestions, apiSuggestActions,
} from "./api.js";
import {
  showToast, openModal, badge, formatDate, isOverdue, renderIcons,
  loading, emptyState, STATUS_LABELS, PRIORITY_LABELS,
} from "./ui.js";

// ---- ESTADO INTERNO ----
let currentFilters = {};
let currentProblemId = null;
let _aiSuggestedActions = [];
let _currentA3Report = null;

// ============================================================================
// TABELA DE PROBLEMAS
// ============================================================================

export async function loadProblems() {
  loading("problems-list");
  const problems = await apiGetProblems(currentFilters);
  if (!problems) return;
  renderProblemsTable(problems);
}

function renderProblemsTable(problems) {
  const el = document.getElementById("problems-list");
  if (problems.length === 0) {
    el.innerHTML = emptyState("clipboard-list", "Nenhum problema encontrado");
    renderIcons();
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>Título</th><th>Área</th><th>Responsável</th>
      <th>Prioridade</th><th>Estado</th><th>Data</th><th>Ações</th>
    </tr></thead>
    <tbody>${problems.map(p => `<tr>
      <td style="color:var(--gray-400);font-size:12px">#${p.id}</td>
      <td><span class="truncate" style="display:block;max-width:220px;cursor:pointer;font-weight:500;color:var(--primary)" data-action="open-detail" data-id="${p.id}">${p.title}</span></td>
      <td>${p.area}</td>
      <td>${p.responsible}</td>
      <td>${badge(p.priority, PRIORITY_LABELS)}</td>
      <td>${badge(p.status, STATUS_LABELS)}</td>
      <td>${formatDate(p.created_at)}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary btn-icon" title="Ver detalhe" data-action="open-detail" data-id="${p.id}"><i data-lucide="eye"></i></button>
          <button class="btn btn-sm btn-secondary btn-icon" title="Editar" data-action="open-edit" data-id="${p.id}"><i data-lucide="pencil"></i></button>
          <button class="btn btn-sm btn-danger btn-icon" title="Apagar" data-action="delete-problem" data-id="${p.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>`).join("")}</tbody>
  </table></div>`;
  renderIcons();
}

// ============================================================================
// ELIMINAR PROBLEMA
// ============================================================================

export async function deleteProblem(id) {
  if (!confirm("Tem a certeza que deseja apagar este problema? Esta ação é irreversível.")) return;
  const res = await apiDeleteProblem(id);
  if (!res) return;
  showToast("Problema eliminado", "success");
  loadProblems();
}

// ============================================================================
// MODAL DE EDIÇÃO
// ============================================================================

export async function openEditProblem(id) {
  const p = await apiGetProblem(id);
  if (!p) return;
  document.getElementById("edit-id").value = p.id;
  document.getElementById("edit-title").value = p.title;
  document.getElementById("edit-description").value = p.description;
  document.getElementById("edit-area").value = p.area;
  document.getElementById("edit-responsible").value = p.responsible;
  document.getElementById("edit-priority").value = p.priority;
  document.getElementById("edit-status").value = p.status;
  openModal("modal-edit");
}

// ============================================================================
// MODAL DE DETALHE
// ============================================================================

export async function openProblemDetail(id) {
  currentProblemId = id;
  const p = await apiGetProblem(id);
  if (!p) return;

  document.getElementById("detail-title").textContent = p.title;
  document.getElementById("detail-badges").innerHTML =
    `${badge(p.status, STATUS_LABELS)} ${badge(p.priority, PRIORITY_LABELS)}`;

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
    } catch {
      w5el.innerHTML = `<p class="text-sm text-gray">Análise salva em formato inválido.</p>`;
    }
  } else {
    w5el.innerHTML = `<div class="empty-state" style="padding:20px">
      <p>Análise 5W1H ainda não gerada.</p>
      <button class="btn btn-primary mt-2" data-action="gen-5w1h"><i data-lucide="sparkles"></i> Gerar com IA</button>
    </div>`;
  }

  // A3
  const a3el = document.getElementById("detail-a3");
  if (p.a3_report) {
    try {
      const r = JSON.parse(p.a3_report);
      renderA3(a3el, r);
    } catch {
      a3el.innerHTML = `<p class="text-sm text-gray">Relatório A3 guardado em formato inválido.</p>`;
    }
  } else {
    a3el.innerHTML = `<div class="empty-state" style="padding:20px">
      <p>Relatório A3 ainda não gerado.</p>
      <button class="btn btn-primary mt-2" data-action="gen-a3"><i data-lucide="sparkles"></i> Gerar com IA</button>
    </div>`;
  }

  // Sugestões — começam sempre com empty-state
  document.getElementById("detail-suggestions").innerHTML = `<div class="empty-state" style="padding:20px">
    <p>Sugestões de melhoria ainda não geradas.</p>
    <button class="btn btn-primary mt-2" data-action="gen-suggestions"><i data-lucide="sparkles"></i> Gerar com IA</button>
  </div>`;

  // Ações
  await loadDetailActions(id);

  openModal("modal-detail");
  renderIcons();
}

// ============================================================================
// AÇÕES DENTRO DO DETALHE
// ============================================================================

export async function loadDetailActions(problemId) {
  const actions = await apiGetActionsForProblem(problemId);
  if (!actions) return;
  const el = document.getElementById("detail-actions");
  const toolbarBtns = `<div class="flex gap-2" style="margin-bottom:12px">
    <button class="btn btn-sm btn-primary" data-action="open-add-action" data-id="${problemId}"><i data-lucide="plus"></i> Adicionar Ação</button>
    <button class="btn btn-sm btn-secondary" id="btn-suggest-actions" data-action="gen-ai-actions" data-id="${problemId}"><i data-lucide="sparkles"></i> Sugerir com IA</button>
  </div>`;
  if (actions.length === 0) {
    el.innerHTML = `${toolbarBtns}<div class="empty-state" style="padding:16px"><p>Nenhuma ação registada</p></div>`;
    renderIcons();
    return;
  }
  el.innerHTML = toolbarBtns + actions.map(a => {
    const over = isOverdue(a.deadline, a.status);
    const done = a.status === "completed";
    return `<div class="action-card">
      <div class="action-check ${done ? "done" : ""}" data-action="toggle-action" data-id="${a.id}" data-status="${done ? "pending" : "completed"}">
        ${done ? '<i data-lucide="check"></i>' : ""}
      </div>
      <div class="action-info">
        <div class="action-title" style="${done ? "text-decoration:line-through;color:var(--gray-400)" : ""}">${a.title}</div>
        <div class="action-meta">${a.responsible} • ${badge(a.status, STATUS_LABELS)}</div>
      </div>
      <div>
        <div class="action-deadline ${over ? "overdue" : ""}"><i data-lucide="calendar"></i>${a.deadline}</div>
      </div>
      <button class="btn btn-sm btn-danger btn-icon" data-action="delete-action" data-id="${a.id}" data-problem-id="${problemId}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }).join("");
  renderIcons();
}

export async function toggleAction(actionId, newStatus) {
  const res = await apiUpdateAction(actionId, { status: newStatus });
  if (!res) return;
  if (currentProblemId) loadDetailActions(currentProblemId);
}

export async function deleteAction(actionId, problemId) {
  if (!confirm("Apagar esta ação?")) return;
  const res = await apiDeleteAction(actionId);
  if (!res) return;
  showToast("Ação eliminada", "success");
  loadDetailActions(problemId);
}

// ============================================================================
// SUGESTÕES DE AÇÕES POR IA
// ============================================================================

export async function generateAIActions(problemId) {
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

  const result = await apiSuggestActions(problemId);

  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles"></i> Sugerir com IA'; renderIcons(); }

  if (!result) {
    container.innerHTML = `<div class="loading" style="color:var(--danger);margin:12px 0">Não foi possível gerar sugestões.</div>
      <button class="btn btn-sm btn-secondary" data-action="gen-ai-actions" data-id="${problemId}" style="margin-bottom:12px">Tentar novamente</button>`;
    return;
  }

  renderAISuggestedActions(container, result.actions || [], problemId);
  showToast("Sugestões de ações geradas!", "success");
}

function renderAISuggestedActions(el, actions, problemId) {
  if (!actions.length) { el.innerHTML = ""; return; }
  _aiSuggestedActions = actions;
  const today = new Date();
  el.innerHTML = `
    <div class="a3-section" style="margin-top:12px">
      <div class="a3-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span><i data-lucide="sparkles"></i> Ações Sugeridas pela IA</span>
        <button class="btn btn-sm btn-secondary" data-action="close-ai-suggestions"><i data-lucide="x"></i> Fechar</button>
      </div>
      ${actions.map((a, i) => {
        const deadline = new Date(today);
        deadline.setDate(deadline.getDate() + (a.deadline_days || 7));
        const deadlineStr = deadline.toISOString().split("T")[0];
        return `<div class="action-card" style="background:var(--gray-50)" id="ai-action-card-${i}">
          <div class="action-info" style="flex:1">
            <div class="action-title">${a.title}</div>
            <div class="action-meta" style="font-size:12px;color:var(--gray-500)">${a.description || ""}</div>
            <div class="action-meta">${a.responsible} • <i data-lucide="calendar"></i> ${deadlineStr}</div>
          </div>
          <button class="btn btn-sm btn-primary" id="ai-action-btn-${i}" data-action="add-suggested-action" data-id="${problemId}" data-index="${i}" data-deadline="${deadlineStr}"><i data-lucide="plus"></i> Adicionar</button>
        </div>`;
      }).join("")}
    </div>`;
  renderIcons();
}

export async function addSuggestedAction(problemId, index, deadline) {
  const btn = document.getElementById(`ai-action-btn-${index}`);
  const action = _aiSuggestedActions[index];
  if (!action || !btn) return;
  btn.disabled = true;
  btn.textContent = "A adicionar...";

  const res = await apiCreateAction({
    problem_id: problemId,
    title: action.title,
    description: action.description || "",
    responsible: action.responsible,
    deadline,
  });

  if (!res) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="plus"></i> Adicionar';
    renderIcons();
    return;
  }

  showToast("Ação adicionada!", "success");
  btn.innerHTML = '<i data-lucide="check"></i> Adicionada';
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-secondary");
  renderIcons();
  await loadDetailActions(problemId);
}

// ============================================================================
// IA: 5W1H
// ============================================================================

export async function generate5W1H() {
  if (!currentProblemId) return;
  const el = document.getElementById("detail-5w1h");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar análise 5W1H com IA...</div>`;
  const analysis = await apiAnalyze5W1H(currentProblemId);
  if (!analysis) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Não foi possível gerar a análise.</div>
      <button class="btn btn-primary" data-action="gen-5w1h" style="margin:12px auto;display:block">Tentar novamente</button>`;
    return;
  }
  render5W1H(el, analysis);
  showToast("Análise 5W1H gerada!", "success");
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
      <span class="ai-badge"><i data-lucide="sparkles"></i> Gerado por IA</span>
      <button class="btn btn-sm btn-secondary" data-action="gen-5w1h"><i data-lucide="refresh-cw"></i> Regenerar</button>
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
  renderIcons();
}

// ============================================================================
// IA: A3
// ============================================================================

export async function generateA3() {
  if (!currentProblemId) return;
  const el = document.getElementById("detail-a3");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar relatório A3 com IA...</div>`;
  const report = await apiGenerateA3(currentProblemId);
  if (!report) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Não foi possível gerar o relatório A3.</div>
      <button class="btn btn-primary" data-action="gen-a3" style="margin:12px auto;display:block">Tentar novamente</button>`;
    return;
  }
  renderA3(el, report);
  showToast("Relatório A3 gerado!", "success");
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
      <span class="ai-badge"><i data-lucide="sparkles"></i> Relatório A3 - IA</span>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-secondary" data-action="gen-a3"><i data-lucide="refresh-cw"></i> Regenerar</button>
        <button class="btn btn-sm btn-primary" data-action="export-a3-pdf"><i data-lucide="download"></i> Exportar PDF</button>
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
  renderIcons();
}

// ============================================================================
// EXPORTAR A3 PARA PDF (jsPDF — copia integral do app.js original)
// ============================================================================

export async function exportA3PDF() {
  if (!_currentA3Report) return;

  const btn = document.querySelector('[data-action="export-a3-pdf"]');
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
    const CW = PW - ML - MR;
    const GAP = 2.5;
    const PAD = 3;
    let y = 11;

    // ── Palette ───────────────────────────────────────────────────────────
    const K = {
      primary: [26,  86, 219], danger:  [220, 38,  38], success: [22, 163,  74],
      warning: [217, 119,  6], purple:  [124, 58, 237], cyan:    [14, 165, 233],
      slate:   [71,  85, 105], text:    [51,  65,  85], muted:   [100, 116, 139],
      border:  [226, 232, 240], bg:     [248, 250, 252], white:  [255, 255, 255],
    };

    const LH = { 7:3.8, 7.5:4.1, 8:4.5, 8.5:4.8, 9:5.2, 9.5:5.5, 10:5.8, 14:7.5 };
    const lh = fs => LH[fs] ?? fs * 0.42;

    function guard(need) {
      if (y + need > PH - MB) { doc.addPage(); y = 11; }
    }

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
    function barAt(label, color, bx, by, bw) {
      fill(bx, by, bw, 6, color);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...K.white);
      doc.text(label, bx + PAD, by + 4.2);
      doc.setTextColor(0, 0, 0);
    }
    function bar(label, color) {
      guard(12);
      barAt(label, color, ML, y, CW);
      y += 7;
    }

    // ── 1. Cabeçalho ─────────────────────────────────────────────────────
    guard(28);
    fill(ML, y, CW, 24, K.primary);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...K.white);
    doc.text('RELATÓRIO A3 — KAIZEN', ML + PAD + 1, y + 8);
    doc.setFontSize(10);
    doc.text(measure(h.titulo || problemTitle, CW - PAD * 2, 10, 'bold')[0] || '', ML + PAD + 1, y + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(
      `Responsável: ${h.responsavel || '—'}   |   Área: ${h.area || '—'}   |   Revisão: ${h.revisao || 'Rev. 01'}   |   Data: ${new Date().toLocaleDateString('pt-PT')}`,
      ML + PAD + 1, y + 21.5
    );
    doc.setTextColor(0, 0, 0);
    y += 27;

    // ── 2. Três colunas: Contexto / Estado Atual / Estado Futuro ─────────
    const cW = (CW - GAP * 2) / 3;
    const textW3 = cW - PAD * 2;
    const colDefs = [
      { label: '1. Contexto / Justificativa', color: K.primary, text: r.background,    x: ML },
      { label: '2. Estado Atual',             color: K.danger,  text: r.current_state, x: ML + cW + GAP },
      { label: '3. Estado Futuro (Meta)',      color: K.success, text: r.target_state,  x: ML + (cW + GAP) * 2 },
    ];
    const colLines = colDefs.map(c => measure(c.text, textW3, 8.5));
    const maxCL   = Math.max(...colLines.map(l => l.length));
    const cBodyH  = maxCL * lh(8.5) + PAD * 2;
    const cBoxH   = 6 + 1 + cBodyH;

    guard(cBoxH + 5);
    const col3Y = y;
    colDefs.forEach(c => { stroke(c.x, col3Y, cW, cBoxH); barAt(c.label, c.color, c.x, col3Y, cW); });
    const col3TextY = col3Y + 6 + 1 + PAD + 1;
    doc.setTextColor(...K.text);
    colDefs.forEach((c, i) => doc.text(colLines[i], c.x + PAD, col3TextY));
    y = col3Y + cBoxH + 5;

    // ── 3. Ishikawa ──────────────────────────────────────────────────────
    const fbCats = [
      ['Máquina',       fb.maquina],     ['Método',        fb.metodo],
      ['Material',      fb.material],    ['Mão de Obra',   fb.mao_de_obra],
      ['Medição',       fb.medicao],     ['Meio Ambiente', fb.meio_ambiente],
    ];
    const fbCW  = (CW - GAP * 2) / 3;
    const fbXs  = [ML, ML + fbCW + GAP, ML + (fbCW + GAP) * 2];
    const fbTW  = fbCW - PAD * 2;

    function fbRowH(slice) {
      const maxItemH = Math.max(...slice.map(([, items]) => {
        if (!items?.length) return lh(8);
        return items.reduce((sum, item) => sum + measure(item, fbTW, 8).length * lh(8), 0);
      }));
      return maxItemH + 13;
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

    // ── 4. Cinco Porquês ─────────────────────────────────────────────────
    bar('5. Análise dos 5 Porquês', K.warning);
    const wyW = CW - 10 - PAD;

    fiveWhys.forEach((w, i) => {
      const qL = measure(w.why    || '', wyW, 9, 'bold');
      const aL = measure(w.answer || '', wyW, 8.5);
      const blockH = qL.length * lh(9) + aL.length * lh(8.5) + 9;
      guard(blockH + 2);
      fill(ML, y, 6.5, 6.5, K.warning);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...K.white);
      doc.text(String(i + 1), ML + (i < 9 ? 2.3 : 1.3), y + 4.8);
      doc.setTextColor(...K.text);
      doc.text(qL, ML + 10, y + 4.8);
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
      doc.setTextColor(...K.text);
      doc.text(rcL, ML + PAD, y + 11);
      y += rcH + 4;
    }

    // ── 5. Contramedidas ─────────────────────────────────────────────────
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

    // ── 6. Plano de implementação ────────────────────────────────────────
    bar('7. Plano de Implementação', K.slate);
    const planTW  = CW - 10 - PAD;

    plan.forEach((step, i) => {
      const titleL  = measure(step.etapa || `Etapa ${i + 1}`, planTW, 9, 'bold');
      const actLines = (step.atividades || []).flatMap(a => measure(`• ${a}`, planTW, 8));
      const hasMeta = !!(step.responsavel || step.prazo);
      const blockH  = titleL.length * lh(9) + (hasMeta ? lh(7.5) + 1.5 : 0) + actLines.length * lh(8) + 5;
      guard(blockH);

      fill(ML, y, 6, 5.5, K.slate);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...K.white);
      doc.text(String(i + 1), ML + 1.3, y + 4);
      doc.setTextColor(...K.text);
      doc.text(titleL, ML + 9, y + 4);
      y += titleL.length * lh(9) + 1;

      if (hasMeta) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...K.muted);
        doc.text(`${step.responsavel || ''}${step.prazo ? ' · ' + step.prazo : ''}`, ML + 9, y + 1);
        y += lh(7.5) + 2;
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...K.text);
      actLines.forEach(line => { guard(lh(8) + 1); doc.text(line, ML + 9, y); y += lh(8); });
      y += 4;
    });

    // ── 7. Acompanhamento + Lições (duas colunas) ────────────────────────
    const hW   = (CW - GAP) / 2;
    const hTW  = hW - PAD * 2;
    const h8x  = ML;
    const h9x  = ML + hW + GAP;

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

    // ── Rodapé em todas as páginas ───────────────────────────────────────
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
    showToast('Erro ao gerar PDF: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="download"></i> Exportar PDF'; renderIcons(); }
  }
}

// ============================================================================
// IA: SUGESTÕES DE MELHORIA
// ============================================================================

export async function generateSuggestions() {
  if (!currentProblemId) return;
  const el = document.getElementById("detail-suggestions");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> A gerar sugestões de melhoria...</div>`;
  const s = await apiGenerateSuggestions(currentProblemId);
  if (!s) {
    el.innerHTML = `<div class="loading" style="color:var(--danger)">Não foi possível gerar as sugestões.</div>
      <button class="btn btn-primary" data-action="gen-suggestions" style="margin:12px auto;display:block">Tentar novamente</button>`;
    return;
  }
  renderSuggestions(el, s);
  showToast("Sugestões geradas!", "success");
}

function renderSuggestions(el, s) {
  const cols = [
    { key: "quick_wins", label: "Quick Wins (≤1 semana)", cls: "quick" },
    { key: "medium_term", label: "Médio Prazo (1-3 meses)", cls: "medium" },
    { key: "long_term", label: "Longo Prazo (3+ meses)", cls: "long" },
  ];
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="ai-badge"><i data-lucide="sparkles"></i> Sugestões por IA</span>
      <button class="btn btn-sm btn-secondary" data-action="gen-suggestions"><i data-lucide="refresh-cw"></i> Regenerar</button>
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
  renderIcons();
}

// ============================================================================
// INIT — listeners dos filtros da tabela de problemas
// ============================================================================

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
