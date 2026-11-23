import { describe, expect, it, vi } from "vitest";
import { createSyncService, mapWithConcurrency } from "../src/services/syncService.js";
import { AppError } from "../src/utils/errors.js";
import { silentLogger, streamOf } from "./helpers.js";

const FILES = [
  { id: "a", name: "relatorio.pdf", mimeType: "application/pdf", size: 10, modifiedTime: "2026-11-01T10:00:00Z" },
  { id: "b", name: "Notas", mimeType: "application/vnd.google-apps.document", size: null, modifiedTime: "2026-11-02T10:00:00Z" },
];

function setup({ files = FILES, exists = () => false, download, upload } = {}) {
  const drive = {
    listDriveFiles: vi.fn().mockResolvedValue(files),
    downloadDriveFile: vi.fn(
      download ??
        (async (id, meta) => ({
          id,
          name: meta.name,
          mimeType: meta.mimeType === "application/pdf" ? "application/pdf" : "application/docx",
          exported: meta.mimeType !== "application/pdf",
          stream: streamOf(),
        })),
    ),
  };
  const blob = {
    blobExists: vi.fn(async (name) => exists(name)),
    uploadStream: vi.fn(upload ?? (async (name) => ({ name }))),
  };
  const logger = silentLogger();
  const service = createSyncService({ drive, blob, logger });
  return { drive, blob, logger, service };
}

describe("syncService.syncFiles", () => {
  it("copia todos os arquivos com sucesso e registra cada transferência no console", async () => {
    const { service, blob, logger } = setup();
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ total: 2, success: 2, skipped: 0, errors: 0, overwrite: false });
    expect(summary.results.map((r) => r.blobName)).toEqual(["relatorio.pdf", "Notas.docx"]);
    expect(summary.results.every((r) => r.status === "success")).toBe(true);
    expect(blob.uploadStream).toHaveBeenCalledTimes(2);
    const [name, , contentType, metadata, options] = blob.uploadStream.mock.calls[0];
    expect(name).toBe("relatorio.pdf");
    expect(contentType).toBe("application/pdf");
    expect(metadata).toMatchObject({ driveFileId: "a", driveModifiedTime: "2026-11-01T10:00:00Z" });
    expect(options).toEqual({ overwrite: false });
    const lines = logger.info.mock.calls.map((c) => c[0]).join("\n");
    expect(lines).toContain("[sync] iniciando: relatorio.pdf");
    expect(lines).toContain("[sync] OK: Notas -> Notas.docx");
  });

  it("marca como skipped quando o blob já existe e não baixa o arquivo", async () => {
    const { service, drive, blob } = setup({ exists: (name) => name === "relatorio.pdf" });
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ total: 2, success: 1, skipped: 1, errors: 0 });
    expect(summary.results[0]).toMatchObject({ name: "relatorio.pdf", status: "skipped" });
    expect(drive.downloadDriveFile).toHaveBeenCalledTimes(1);
    expect(blob.uploadStream).toHaveBeenCalledTimes(1);
  });

  it("com overwrite=true substitui sem consultar a existência", async () => {
    const { service, blob } = setup({ exists: () => true });
    const summary = await service.syncFiles({ overwrite: true });
    expect(summary).toMatchObject({ success: 2, skipped: 0, overwrite: true });
    expect(blob.blobExists).toHaveBeenCalledTimes(0);
    expect(blob.uploadStream.mock.calls[0][4]).toEqual({ overwrite: true });
  });

  it("um erro de download não interrompe os demais", async () => {
    const { service, logger } = setup({
      download: async (id, meta) => {
        if (id === "a") throw new AppError("Sem permissão no Google Drive.", { status: 502 });
        return { id, name: `${meta.name}.docx`, mimeType: "x", exported: true, stream: streamOf() };
      },
    });
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ total: 2, success: 1, errors: 1 });
    expect(summary.results[0].status).toBe("error");
    expect(summary.results[0].message).toContain("Falha no download");
    expect(summary.results[0].message).toContain("Sem permissão no Google Drive.");
    expect(logger.error).toHaveBeenCalled();
  });

  it("um erro de upload vira status error com mensagem segura", async () => {
    const { service } = setup({
      upload: async (name) => {
        if (name === "Notas.docx") throw new Error("AccountKey=SEGREDO falhou");
        return { name };
      },
    });
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ success: 1, errors: 1 });
    const failed = summary.results[1];
    expect(failed.status).toBe("error");
    expect(failed.message).toContain("Falha no upload");
    expect(JSON.stringify(summary)).not.toContain("SEGREDO");
  });

  it("conflito de escrita concorrente (blob criado no meio) vira skipped", async () => {
    const { service } = setup({
      upload: async () => {
        throw new AppError("O blob já existe no contêiner.", { status: 409, code: "blob_existe" });
      },
    });
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ skipped: 2, errors: 0 });
  });

  it("nomes duplicados na origem: o segundo é ignorado para não sobrescrever o primeiro", async () => {
    const files = [
      { id: "1", name: "foto.png", mimeType: "image/png" },
      { id: "2", name: "foto.png", mimeType: "image/png" },
    ];
    const { service, blob } = setup({ files });
    const summary = await service.syncFiles();
    expect(summary).toMatchObject({ success: 1, skipped: 1 });
    expect(summary.results[1].message).toContain("mesmo nome");
    expect(blob.uploadStream).toHaveBeenCalledTimes(1);
  });

  it("propaga erro de listagem da origem (nada a sincronizar)", async () => {
    const { service, drive } = setup();
    drive.listDriveFiles.mockRejectedValue(new AppError("Pasta não encontrada.", { status: 502 }));
    await expect(service.syncFiles()).rejects.toThrow("Pasta não encontrada.");
  });
});

describe("mapWithConcurrency", () => {
  it("nunca passa do limite de 3 tarefas simultâneas e mantém a ordem", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});
