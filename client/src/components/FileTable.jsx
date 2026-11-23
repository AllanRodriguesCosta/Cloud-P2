import { formatDate, formatSize, formatType } from "../format.js";

/**
 * Tabela genérica de arquivos.
 * @param {{ id: string, title: string, rows: Array<{key,name,type,size,modified,link?}>|null, loading: boolean, emptyText: string }} props
 */
export function FileTable({ id, title, rows, loading, emptyText }) {
  return (
    <section className="card" aria-labelledby={`${id}-titulo`} aria-busy={loading}>
      <header className="card__header">
        <h2 id={`${id}-titulo`}>{title}</h2>
        {rows && <span className="badge">{rows.length} item(ns)</span>}
      </header>
      {loading && <p className="muted" role="status">Carregando…</p>}
      {!loading && rows === null && <p className="muted">Clique no botão para listar.</p>}
      {!loading && rows && rows.length === 0 && <p className="muted">{emptyText}</p>}
      {!loading && rows && rows.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={title}>
          <table>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="num">Tamanho</th>
                <th scope="col">Modificação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td data-label="Nome">
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noreferrer noopener">{r.name}</a>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td data-label="Tipo">{formatType(r.type)}</td>
                  <td data-label="Tamanho" className="num">{formatSize(r.size)}</td>
                  <td data-label="Modificação">{formatDate(r.modified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
