// ============================================================================
// main.js — ponto de entrada da aplicação.
//   - Define navigate()
//   - Regista o listener único de delegação de cliques
//   - Regista os submit handlers dos formulários
//   - Arranca a vista inicial
// As libs externas (Chart.js, jsPDF, lucide) continuam carregadas via <script>
// na index.html e são acedidas como globais (window.Chart, window.jspdf, lucide).
// ============================================================================

import { showToast, closeModal, renderIcons } from "./ui.js";
import {
  apiCreateProblem, apiUpdateProblem, apiCreateAction, apiSeed,
} from "./api.js";
import { loadDashboard } from "./dashboard.js";
import {
  loadProblems, openProblemDetail, openEditProblem, deleteProblem,
  generate5W1H, generateA3, generateSuggestions, generateAIActions,
  exportA3PDF, toggleAction, deleteAction, addSuggestedAction,
  loadDetailActions,
} from "./problems.js";
import {
  loadActions, exportActionsExcel, deleteActionGlobal, openAddAction,
} from "./actions.js";

// ============================================================================
// NAVEGAÇÃO
// ============================================================================

const VIEW_TITLES = {
  dashboard: "Dashboard",
  problems: "Problemas Kaizen",
  "new-problem": "Novo Problema",
  actions: "Tracker de Ações",
};

const VIEW_LOADERS = {
  dashboard: loadDashboard,
  problems: loadProblems,
  actions: loadActions,
};

function navigate(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  document.getElementById("topbar-title").textContent = VIEW_TITLES[view] || view;
  VIEW_LOADERS[view]?.();
}

// ============================================================================
// SEED (botão no banner do dashboard)
// ============================================================================

async function seedDatabase() {
  const btn = document.getElementById("btn-seed");
  if (btn) { btn.disabled = true; btn.textContent = "A carregar..."; }
  const res = await apiSeed();
  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="database"></i> Carregar Dados de Exemplo'; renderIcons(); }
  if (!res) return;
  showToast(res.message, "success");
  loadDashboard();
}

// ============================================================================
// DELEGAÇÃO DE CLIQUES — único listener no document.
// Resolve por ordem: data-nav → data-view → data-action.
// ============================================================================

document.addEventListener("click", e => {
  const navEl = e.target.closest("[data-nav]");
  if (navEl) { navigate(navEl.dataset.nav); return; }

  const viewEl = e.target.closest("[data-view]");
  if (viewEl) { navigate(viewEl.dataset.view); return; }

  const el = e.target.closest("[data-action]");
  if (!el) return;

  const action = el.dataset.action;
  const id = el.dataset.id ? parseInt(el.dataset.id, 10) : null;

  if (el.tagName === "A") e.preventDefault();

  switch (action) {
    case "seed":                 seedDatabase(); break;
    case "export-excel":         exportActionsExcel(); break;
    case "open-detail":          openProblemDetail(id); break;
    case "open-edit":            openEditProblem(id); break;
    case "delete-problem":       deleteProblem(id); break;
    case "open-add-action":      openAddAction(id); break;
    case "gen-5w1h":             generate5W1H(); break;
    case "gen-a3":               generateA3(); break;
    case "gen-suggestions":      generateSuggestions(); break;
    case "gen-ai-actions":       generateAIActions(id); break;
    case "export-a3-pdf":        exportA3PDF(); break;
    case "toggle-action":        toggleAction(id, el.dataset.status); break;
    case "toggle-action-list":
      toggleAction(id, el.dataset.status);
      loadActions();
      break;
    case "delete-action":
      deleteAction(id, parseInt(el.dataset.problemId, 10));
      break;
    case "delete-action-global": deleteActionGlobal(id); break;
    case "close-ai-suggestions": el.closest(".a3-section")?.remove(); break;
    case "add-suggested-action":
      addSuggestedAction(id, parseInt(el.dataset.index, 10), el.dataset.deadline);
      break;
  }
});

// ============================================================================
// SUBMIT DOS FORMULÁRIOS
// ============================================================================

// Novo problema
document.getElementById("problem-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = "A guardar...";

  const data = {
    title: document.getElementById("p-title").value,
    description: document.getElementById("p-description").value,
    area: document.getElementById("p-area").value,
    responsible: document.getElementById("p-responsible").value,
    priority: document.getElementById("p-priority").value,
  };
  const res = await apiCreateProblem(data);

  btn.disabled = false;
  btn.textContent = "Registar Problema";
  if (!res) return;

  showToast("Problema registado com sucesso!", "success");
  e.target.reset();
  navigate("problems");
});

// Editar problema
document.getElementById("edit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;

  const res = await apiUpdateProblem(id, {
    title: document.getElementById("edit-title").value,
    description: document.getElementById("edit-description").value,
    area: document.getElementById("edit-area").value,
    responsible: document.getElementById("edit-responsible").value,
    priority: document.getElementById("edit-priority").value,
    status: document.getElementById("edit-status").value,
  });

  btn.disabled = false;
  if (!res) return;

  showToast("Problema atualizado", "success");
  closeModal("modal-edit");
  loadProblems();
});

// Adicionar ação a um problema
document.getElementById("action-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;

  const problemId = parseInt(document.getElementById("action-problem-id").value);
  const res = await apiCreateAction({
    problem_id: problemId,
    title: document.getElementById("action-title").value,
    description: document.getElementById("action-desc").value,
    responsible: document.getElementById("action-responsible").value,
    deadline: document.getElementById("action-deadline").value,
  });

  btn.disabled = false;
  if (!res) return;

  showToast("Ação adicionada!", "success");
  e.target.reset();
  closeModal("modal-action");
  loadDetailActions(problemId);
});

// ============================================================================
// ARRANQUE
// ============================================================================

renderIcons();
navigate("dashboard");
