// ============================================================================
// actions.js — vista global do tracker de ações.
//   - Tabela + filtro de estado
//   - Abrir modal "Adicionar Ação" (form submit fica em main.js)
//   - Exportar para Excel
//   - Eliminar ação (na vista global)
// O `toggleAction` é partilhado com o detalhe de problema, por isso vive em
// problems.js e é encadeado a partir de main.js.
// ============================================================================
import { apiGetActions, apiDeleteAction } from "./api.js";
import {
  showToast, openModal, badge, isOverdue, renderIcons, loading, emptyState,
  STATUS_LABELS,
} from "./ui.js";

export async function loadActions() {
  loading("actions-list");
  const statusFilter = document.getElementById("action-filter-status")?.value || "";
  const actions = await apiGetActions(statusFilter);
  if (!actions) return;
  renderActionsTable(actions);
}

function renderActionsTable(actions) {
  const el = document.getElementById("actions-list");
  if (actions.length === 0) {
    el.innerHTML = emptyState("check-circle-2", "Nenhuma ação encontrada");
    renderIcons();
    return;
  }
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
        <td><a href="#" data-action="open-detail" data-id="${a.problem_id}" style="color:var(--primary);font-size:13px">#${a.problem_id}</a></td>
        <td>${a.responsible}</td>
        <td class="${over ? "text-danger" : ""}" style="${over ? "color:var(--danger);font-weight:600" : ""}">${a.deadline}${over ? ' <i data-lucide="alert-triangle" style="width:13px;height:13px;vertical-align:-2px;color:var(--danger)"></i>' : ""}</td>
        <td>${badge(a.status, STATUS_LABELS)}</td>
        <td>
          <div class="flex gap-2">
            ${a.status !== "completed"
              ? `<button class="btn btn-sm btn-success btn-icon" title="Marcar concluída" data-action="toggle-action-list" data-id="${a.id}" data-status="completed"><i data-lucide="check"></i></button>`
              : `<button class="btn btn-sm btn-secondary btn-icon" title="Reabrir" data-action="toggle-action-list" data-id="${a.id}" data-status="pending"><i data-lucide="undo-2"></i></button>`}
            <button class="btn btn-sm btn-danger btn-icon" data-action="delete-action-global" data-id="${a.id}"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
  renderIcons();
}

export function exportActionsExcel() {
  const statusFilter = document.getElementById("action-filter-status")?.value;
  let url = "/api/actions/export";
  if (statusFilter) url += `?status=${statusFilter}`;
  window.location.href = url;
}

export async function deleteActionGlobal(id) {
  if (!confirm("Apagar esta ação?")) return;
  const res = await apiDeleteAction(id);
  if (!res) return;
  showToast("Ação eliminada", "success");
  loadActions();
}

export function openAddAction(problemId) {
  document.getElementById("action-problem-id").value = problemId;
  openModal("modal-action");
}

// ---- INIT — filtro de estado ----
document.getElementById("action-filter-status")?.addEventListener("change", loadActions);
