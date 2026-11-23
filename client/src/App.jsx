import { useEffect, useState } from "react";
import { api } from "./api.js";
import { FileTable } from "./components/FileTable.jsx";
import { SyncResults } from "./components/SyncResults.jsx";

export const CONTAINER = "P2_Allan_ribeiro";

function toSourceRows(files) {
  return files.map((f) => ({
    key: f.id,
    name: f.name,
    type: f.mimeType,
    size: f.size,
    modified: f.modifiedTime,
    link: f.webViewLink,
  }));
}

function toDestinationRows(blobs) {
  return blobs.map((b) => ({
    key: b.name,
    name: b.name,
    type: b.contentType,
    size: b.contentLength,
    modified: b.lastModified,
  }));
}

export default function App() {
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [summary, setSummary] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState({ source: false, destination: false, sync: false });
  const [error, setError] = useState("");
  const [azureName, setAzureName] = useState("");

  useEffect(() => {
    let alive = true;
    api.info().then(
      (info) => alive && setAzureName(info?.azureContainer || ""),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const busy = loading.source || loading.destination || loading.sync;

  async function run(kind, action) {
    setError("");
    setLoading((l) => ({ ...l, [kind]: true }));
    try {
      await action();
    } catch (err) {
      setError(err.message || "Erro inesperado.");
    } finally {
      setLoading((l) => ({ ...l, [kind]: false }));
    }
  }

  const listSource = () => run("source", async () => setSource(toSourceRows((await api.source()).files)));
  const listDestination = () =>
    run("destination", async () => setDestination(toDestinationRows((await api.destination()).blobs)));
  const sync = () =>
    run("sync", async () => {
      const result = await api.sync(overwrite);
      setSummary(result);
      try {
        setDestination(toDestinationRows((await api.destination()).blobs));
      } catch {
        /* o resumo já foi exibido; a lista do destino pode ser atualizada manualmente */
      }
    });

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">P2 · Computação em Nuvem</p>
        <h1>Google Drive → Azure Blob Storage</h1>
        <p>
          Contêiner de destino: <strong>{CONTAINER}</strong>
          {azureName && azureName !== CONTAINER && (
            <span className="muted"> (nome no Azure: <code>{azureName}</code>)</span>
          )}
        </p>
      </header>

      <main>
        <section className="toolbar card" aria-label="Ações">
          <div className="buttons">
            <button type="button" onClick={listSource} disabled={busy}>
              {loading.source ? "Listando…" : "Listar origem"}
            </button>
            <button type="button" onClick={listDestination} disabled={busy}>
              {loading.destination ? "Listando…" : "Listar destino"}
            </button>
            <button type="button" className="primary" onClick={sync} disabled={busy}>
              {loading.sync ? "Sincronizando…" : "Sincronizar"}
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={busy}
            />
            Sobrescrever arquivos existentes
          </label>
        </section>

        {error && (
          <div className="alert" role="alert">
            <strong>Erro:</strong> {error}
          </div>
        )}

        <div className="grid">
          <FileTable
            id="origem"
            title="Origem · Google Drive"
            rows={source}
            loading={loading.source}
            emptyText="Nenhum arquivo na pasta do Drive."
          />
          <FileTable
            id="destino"
            title={`Destino · ${CONTAINER}`}
            rows={destination}
            loading={loading.destination}
            emptyText="O contêiner está vazio."
          />
        </div>

        <SyncResults summary={summary} loading={loading.sync} />
      </main>

      <footer className="footer muted">
        Credenciais ficam apenas no servidor. Esta página só conversa com <code>/api</code>.
      </footer>
    </div>
  );
}
