/** Cliente da API. Usa caminhos relativos: em produção o mesmo servidor serve /api; em dev o Vite faz proxy. */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor. Verifique se ele está rodando.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.error || `O servidor respondeu com erro ${response.status}.`);
  }
  return data;
}

export const api = {
  info: () => request("/api/info"),
  source: () => request("/api/source"),
  destination: () => request("/api/destination"),
  sync: (overwrite) => request("/api/sync", { method: "POST", body: JSON.stringify({ overwrite }) }),
};
