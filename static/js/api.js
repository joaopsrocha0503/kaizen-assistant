// ============================================================================
// api.js — chamadas a /api/. Cada função tem try/catch:
//   em sucesso devolve os dados; em erro mostra toast e devolve null.
// O caller só precisa de verificar `if (!res) return;`.
// ============================================================================
import { showToast } from "./ui.js";

async function _fetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro desconhecido");
  return data;
}

// Embrulha qualquer função async num try/catch que mostra toast e devolve null.
function _wrap(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      showToast(err.message || "Erro de comunicação com o servidor", "error");
      return null;
    }
  };
}

// ---- KPIs e estatísticas ----

export const apiGetKpis            = _wrap(() => _fetch("/api/kpis"));
export const apiGetMonthlyStats    = _wrap(() => _fetch("/api/stats/monthly"));
export const apiGetUpcomingActions = _wrap(() => _fetch("/api/actions/upcoming"));

// ---- Problemas ----

export const apiGetProblems = _wrap((filters = {}) => {
  const params = new URLSearchParams(filters);
  const q = params.toString();
  return _fetch("/api/problems" + (q ? "?" + q : ""));
});
export const apiGetProblem    = _wrap(id => _fetch(`/api/problems/${id}`));
export const apiCreateProblem = _wrap(data => _fetch("/api/problems", { method: "POST", body: JSON.stringify(data) }));
export const apiUpdateProblem = _wrap((id, data) => _fetch(`/api/problems/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const apiDeleteProblem = _wrap(id => _fetch(`/api/problems/${id}`, { method: "DELETE" }));

// ---- Ações ----

export const apiGetActions = _wrap((status = "") => {
  const url = "/api/actions" + (status ? `?status=${status}` : "");
  return _fetch(url);
});
export const apiGetActionsForProblem = _wrap(problemId => _fetch(`/api/actions?problem_id=${problemId}`));
export const apiCreateAction = _wrap(data => _fetch("/api/actions", { method: "POST", body: JSON.stringify(data) }));
export const apiUpdateAction = _wrap((id, data) => _fetch(`/api/actions/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const apiDeleteAction = _wrap(id => _fetch(`/api/actions/${id}`, { method: "DELETE" }));

// ---- IA (Groq) ----

export const apiAnalyze5W1H         = _wrap(problemId => _fetch(`/api/problems/${problemId}/analyze`,         { method: "POST" }));
export const apiGenerateA3          = _wrap(problemId => _fetch(`/api/problems/${problemId}/a3`,              { method: "POST" }));
export const apiGenerateSuggestions = _wrap(problemId => _fetch(`/api/problems/${problemId}/suggestions`,     { method: "POST" }));
export const apiSuggestActions      = _wrap(problemId => _fetch(`/api/problems/${problemId}/suggest_actions`, { method: "POST" }));

// ---- Seed ----

export const apiSeed = _wrap(() => _fetch("/api/seed", { method: "POST" }));
