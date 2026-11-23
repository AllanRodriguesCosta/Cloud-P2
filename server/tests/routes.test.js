import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/utils/errors.js";
import { silentLogger } from "./helpers.js";

let server;
let base;
let services;

async function start(overrides = {}) {
  services = {
    driveService: {
      listDriveFiles: vi.fn().mockResolvedValue([
        { id: "a", name: "relatorio.pdf", mimeType: "application/pdf", size: 10, modifiedTime: "2026-11-01T10:00:00Z", webViewLink: null },
      ]),
    },
    blobService: {
      listBlobs: vi.fn().mockResolvedValue([
        { name: "relatorio.pdf", contentLength: 10, contentType: "application/pdf", lastModified: "2026-11-03T10:00:00.000Z" },
      ]),
    },
    syncService: {
      syncFiles: vi.fn().mockResolvedValue({ total: 1, success: 1, skipped: 0, errors: 0, results: [] }),
    },
    ...overrides,
  };
  const app = createApp({
    ...services,
    publicInfo: { container: "P2_Allan_ribeiro", azureContainer: "p2-allan-ribeiro" },
    corsOrigin: ["http://localhost:5173"],
    logger: silentLogger(),
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}

const json = (path, init = {}) =>
  fetch(base + path, init).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json() }));

const post = (path, body, headers = {}) =>
  json(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });

beforeEach(() => start());
afterEach(() => new Promise((resolve) => server.close(resolve)));

describe("API", () => {
  it("GET /api/health responde status ok", async () => {
    const r = await json("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
  });

  it("GET /api/source devolve a lista do Drive", async () => {
    const r = await json("/api/source");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.files[0]).toMatchObject({ id: "a", name: "relatorio.pdf" });
  });

  it("GET /api/destination devolve os blobs e o nome do contêiner", async () => {
    const r = await json("/api/destination");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ container: "p2-allan-ribeiro", total: 1 });
    expect(r.body.blobs[0].name).toBe("relatorio.pdf");
  });

  it("POST /api/sync usa overwrite=false por padrão", async () => {
    const r = await post("/api/sync", "{}");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1, success: 1 });
    expect(services.syncService.syncFiles).toHaveBeenCalledWith({ overwrite: false });
  });

  it("POST /api/sync repassa overwrite=true", async () => {
    await post("/api/sync", JSON.stringify({ overwrite: true }));
    expect(services.syncService.syncFiles).toHaveBeenCalledWith({ overwrite: true });
  });

  it("POST /api/sync sem corpo também funciona", async () => {
    const r = await json("/api/sync", { method: "POST" });
    expect(r.status).toBe(200);
    expect(services.syncService.syncFiles).toHaveBeenCalledWith({ overwrite: false });
  });

  it("POST /api/sync recusa overwrite que não é booleano (400)", async () => {
    const r = await post("/api/sync", JSON.stringify({ overwrite: "sim" }));
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("overwrite");
    expect(services.syncService.syncFiles).toHaveBeenCalledTimes(0);
  });

  it("POST /api/sync recusa JSON inválido (400)", async () => {
    const r = await post("/api/sync", "{quebrado");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "JSON inválido no corpo da requisição." });
  });

  it("erro de integração vira { error } seguro com status coerente", async () => {
    services.driveService.listDriveFiles.mockRejectedValue(
      new AppError("Sem permissão no Google Drive.", { status: 502 }),
    );
    const r = await json("/api/source");
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: "Sem permissão no Google Drive." });
  });

  it("erro inesperado não vaza detalhes internos (500)", async () => {
    services.blobService.listBlobs.mockRejectedValue(new Error("AccountKey=SEGREDO stack interna"));
    const r = await json("/api/destination");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("SEGREDO");
    expect(r.body.error).toBeTruthy();
  });

  it("rota /api desconhecida responde 404 em JSON", async () => {
    const r = await json("/api/nao-existe");
    expect(r.status).toBe(404);
    expect(r.body.error).toContain("não encontrada");
  });

  it("CORS: libera a origem de desenvolvimento e bloqueia outras", async () => {
    const ok = await json("/api/health", { headers: { Origin: "http://localhost:5173" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const blocked = await json("/api/health", { headers: { Origin: "https://site-malicioso.example" } });
    expect(blocked.status).toBe(403);
  });

  it("CORS: aceita a mesma origem (frontend servido pelo próprio Express)", async () => {
    const r = await json("/api/health", { headers: { Origin: base } });
    expect(r.status).toBe(200);
  });

  it("GET /api/info expõe só dados públicos", async () => {
    const r = await json("/api/info");
    expect(r.body).toEqual({ container: "P2_Allan_ribeiro", azureContainer: "p2-allan-ribeiro" });
  });
});
