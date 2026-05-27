// ============================================================================
// ui.js — utilitários de interface (toasts, modais, ícones, formatadores)
// Sem dependências de outros módulos do projeto.
// ============================================================================

export const STATUS_LABELS = {
  open: "Aberto",
  in_progress: "Em Progresso",
  completed: "Concluído",
  cancelled: "Cancelado",
  pending: "Pendente",
  overdue: "Atrasado",
};

export const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

// ---- TOASTS ----

export function showToast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---- ÍCONES (Lucide) ----

export function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// ---- MODAIS ----

export function openModal(id) {
  document.getElementById(id).classList.add("open");
}

export function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

// ---- FORMATADORES ----

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT");
}

export function isOverdue(deadline, status) {
  if (status === "completed") return false;
  return new Date(deadline) < new Date();
}

export function badge(val, map) {
  const label = map[val] || val;
  return `<span class="badge badge-${val}">${label}</span>`;
}

// ---- ESTADOS COMUNS DE LISTA ----

export function loading(id) {
  document.getElementById(id).innerHTML =
    `<div class="loading"><div class="spinner"></div> A carregar...</div>`;
}

export function emptyState(iconName, text) {
  return `<div class="empty-state"><div class="empty-icon"><i data-lucide="${iconName}"></i></div><p>${text}</p></div>`;
}

// ============================================================================
// INIT — handlers globais de UI que não dependem de render dinâmico
// (modais e tabs). Executam ao importar o módulo; em ES modules deferidos
// o DOM já está pronto.
// ============================================================================

// Fechar modal ao clicar fora
document.querySelectorAll(".modal-overlay").forEach(m => {
  m.addEventListener("click", e => {
    if (e.target === m) m.classList.remove("open");
  });
});

// Botões com data-close-modal
document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});

// Tabs do detalhe (data-tab-group + data-tab)
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
