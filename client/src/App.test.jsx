// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE = {
  total: 2,
  files: [
    { id: "1", name: "relatorio.pdf", mimeType: "application/pdf", size: 2048, modifiedTime: "2026-11-01T10:00:00Z", webViewLink: "https://drive.google.com/file/d/1" },
    { id: "2", name: "Notas", mimeType: "application/vnd.google-apps.document", size: null, modifiedTime: "2026-11-02T10:00:00Z", webViewLink: null },
  ],
};
const DESTINATION = {
  container: "p2-allan-ribeiro",
  total: 1,
  blobs: [{ name: "relatorio.pdf", contentLength: 2048, contentType: "application/pdf", lastModified: "2026-11-03T10:00:00Z" }],
};
const SUMMARY = {
  total: 3,
  success: 1,
  skipped: 1,
  errors: 1,
  results: [
    { name: "Notas", blobName: "Notas.docx", status: "success", message: "Copiado." },
    { name: "relatorio.pdf", blobName: "relatorio.pdf", status: "skipped", message: "Já existe no contêiner." },
    { name: "video.mp4", blobName: "video.mp4", status: "error", message: "Falha no upload: Sem permissão." },
  ],
};

function respond(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

let container;
let root;
let originalFetch;
let pending;

function mockApi(handlers) {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const key = `${init.method || "GET"} ${url}`;
    const handler = handlers[key];
    if (!handler) return respond({ error: "não mockado" }, 404);
    return handler(init);
  });
}

async function render() {
  await act(async () => {
    root.render(<App />);
  });
}

async function click(label) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!button) throw new Error(`botão não encontrado: ${label}`);
  await act(async () => {
    button.click();
  });
  return button;
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  originalFetch = globalThis.fetch;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  pending = undefined;
});

describe("App", () => {
  it("mostra o título e o contêiner P2_Allan_ribeiro com o nome real no Azure", async () => {
    mockApi({ "GET /api/info": () => respond({ container: "P2_Allan_ribeiro", azureContainer: "p2-allan-ribeiro" }) });
    await render();
    await flush();
    expect(container.querySelector("h1").textContent).toContain("Google Drive");
    expect(container.textContent).toContain("P2_Allan_ribeiro");
    expect(container.textContent).toContain("p2-allan-ribeiro");
  });

  it("exibe carregamento, desabilita os botões e depois mostra a tabela da origem", async () => {
    mockApi({
      "GET /api/info": () => respond({}),
      "GET /api/source": () => new Promise((resolve) => (pending = () => resolve(respond(SOURCE)))),
    });
    await render();
    await click("Listar origem");
    expect(container.textContent).toContain("Carregando…");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.every((b) => b.disabled)).toBe(true);

    await act(async () => {
      pending();
    });
    await flush();
    const rows = container.querySelectorAll("section[aria-labelledby='origem-titulo'] tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("relatorio.pdf");
    expect(rows[0].textContent).toContain("PDF");
    expect(rows[0].textContent).toContain("2 KB");
    expect(rows[1].textContent).toContain("Documento Google");
    expect([...container.querySelectorAll("button")].some((b) => b.disabled)).toBe(false);
  });

  it("lista o destino em outra tabela", async () => {
    mockApi({ "GET /api/info": () => respond({}), "GET /api/destination": () => respond(DESTINATION) });
    await render();
    await click("Listar destino");
    await flush();
    const rows = container.querySelectorAll("section[aria-labelledby='destino-titulo'] tbody tr");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("relatorio.pdf");
  });

  it("sincroniza enviando overwrite marcado e mostra o status por arquivo", async () => {
    let sentBody;
    mockApi({
      "GET /api/info": () => respond({}),
      "POST /api/sync": (init) => {
        sentBody = JSON.parse(init.body);
        return respond(SUMMARY);
      },
      "GET /api/destination": () => respond(DESTINATION),
    });
    await render();
    const checkbox = container.querySelector("input[type='checkbox']");
    await act(async () => {
      checkbox.click();
    });
    await click("Sincronizar");
    await flush();
    expect(sentBody).toEqual({ overwrite: true });
    const items = container.querySelectorAll(".results li");
    expect(items.length).toBe(3);
    expect(items[0].className).toContain("result--success");
    expect(items[1].className).toContain("result--skipped");
    expect(items[2].className).toContain("result--error");
    expect(items[2].textContent).toContain("Falha no upload");
    const stats = container.querySelector(".stats").textContent;
    expect(stats).toContain("Sucesso1");
    expect(stats).toContain("Erros1");
  });

  it("mostra a mensagem de erro segura vinda da API", async () => {
    mockApi({
      "GET /api/info": () => respond({}),
      "GET /api/source": () => respond({ error: "Sem permissão no Google Drive." }, 502),
    });
    await render();
    await click("Listar origem");
    await flush();
    const alert = container.querySelector("[role='alert']");
    expect(alert.textContent).toContain("Sem permissão no Google Drive.");
  });
});
