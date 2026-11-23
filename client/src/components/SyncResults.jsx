const LABEL = { success: "Copiado", skipped: "Ignorado", error: "Erro" };
const ICON = { success: "✔", skipped: "↷", error: "✖" };

export function SyncResults({ summary, loading }) {
  return (
    <section className="card" aria-labelledby="resultado-titulo" aria-busy={loading}>
      <header className="card__header">
        <h2 id="resultado-titulo">Resultado da sincronização</h2>
      </header>
      {loading && <p className="muted" role="status">Sincronizando… isso pode levar alguns minutos.</p>}
      {!loading && !summary && <p className="muted">Nenhuma sincronização feita nesta sessão.</p>}
      {!loading && summary && (
        <>
          <dl className="stats" aria-label="Resumo">
            <div><dt>Total</dt><dd>{summary.total}</dd></div>
            <div className="ok"><dt>Sucesso</dt><dd>{summary.success}</dd></div>
            <div className="skip"><dt>Ignorados</dt><dd>{summary.skipped}</dd></div>
            <div className="err"><dt>Erros</dt><dd>{summary.errors}</dd></div>
          </dl>
          {summary.results.length === 0 ? (
            <p className="muted">A pasta de origem está vazia.</p>
          ) : (
            <ul className="results" aria-label="Detalhes por arquivo">
              {summary.results.map((r, i) => (
                <li key={`${r.blobName}-${i}`} className={`result result--${r.status}`}>
                  <span className="result__icon" aria-hidden="true">{ICON[r.status]}</span>
                  <span className="result__status">{LABEL[r.status] ?? r.status}</span>
                  <span className="result__name">
                    {r.name}
                    {r.blobName && r.blobName !== r.name && <small> → {r.blobName}</small>}
                  </span>
                  <span className="result__msg">{r.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
