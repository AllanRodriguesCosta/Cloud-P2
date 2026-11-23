import { describe, expect, it, vi } from "vitest";
import { createAzureBlobService, toBlobMetadata, translateAzureError } from "../src/services/azureBlobService.js";
import { streamOf } from "./helpers.js";

function fakeContainer({ blobs = [], exists = false } = {}) {
  const blockBlob = { exists: vi.fn().mockResolvedValue(exists), uploadStream: vi.fn().mockResolvedValue({}) };
  return {
    blockBlob,
    createIfNotExists: vi.fn().mockResolvedValue({ succeeded: true }),
    getBlockBlobClient: vi.fn().mockReturnValue(blockBlob),
    listBlobsFlat: vi.fn(async function* () {
      yield* blobs;
    }),
  };
}

describe("azureBlobService", () => {
  it("cria o contêiner uma única vez e lista os campos exigidos", async () => {
    const container = fakeContainer({
      blobs: [
        {
          name: "a.pdf",
          metadata: { sourceName: encodeURIComponent("Relatório.pdf") },
          properties: { contentLength: 3, contentType: "application/pdf", lastModified: new Date("2026-11-01T00:00:00Z") },
        },
      ],
    });
    const service = createAzureBlobService({ containerClient: container });
    const blobs = await service.listBlobs();
    await service.listBlobs();
    expect(container.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(blobs[0]).toEqual({
      name: "a.pdf",
      contentLength: 3,
      contentType: "application/pdf",
      lastModified: "2026-11-01T00:00:00.000Z",
      metadata: { sourceName: "Relatório.pdf" },
    });
  });

  it("blobExists consulta o blob pelo nome", async () => {
    const container = fakeContainer({ exists: true });
    const service = createAzureBlobService({ containerClient: container });
    expect(await service.blobExists("a.pdf")).toBe(true);
    expect(container.getBlockBlobClient).toHaveBeenCalledWith("a.pdf");
  });

  it("uploadStream preserva MIME, grava metadados ASCII e não sobrescreve por padrão", async () => {
    const container = fakeContainer();
    const service = createAzureBlobService({ containerClient: container });
    const stream = streamOf();
    await service.uploadStream("Relatório.pdf", stream, "application/pdf", { driveFileId: "abc", sourceName: "Relatório.pdf" });
    const [sent, , , options] = container.blockBlob.uploadStream.mock.calls[0];
    expect(sent).toBe(stream);
    expect(options.blobHTTPHeaders).toEqual({ blobContentType: "application/pdf" });
    expect(options.metadata).toEqual({ driveFileId: "abc", sourceName: "Relat%C3%B3rio.pdf" });
    expect(options.conditions).toEqual({ ifNoneMatch: "*" });

    await service.uploadStream("b.pdf", streamOf(), "application/pdf", {}, { overwrite: true });
    expect(container.blockBlob.uploadStream.mock.calls[1][3].conditions).toBe(undefined);
  });

  it("traduz conflito e falta de permissão", () => {
    expect(translateAzureError({ statusCode: 409, code: "BlobAlreadyExists" }).code).toBe("blob_existe");
    expect(translateAzureError({ statusCode: 403, code: "AuthenticationFailed" }).message).toContain("Connection String");
  });

  it("toBlobMetadata descarta vazios e normaliza chaves", () => {
    expect(toBlobMetadata({ "drive-id": "x", vazio: "", nulo: null })).toEqual({ drive_id: "x" });
  });
});
