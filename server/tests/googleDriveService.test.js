import { describe, expect, it, vi } from "vitest";
import {
  createGoogleDriveService,
  finalFileInfo,
  translateDriveError,
} from "../src/services/googleDriveService.js";
import { streamOf } from "./helpers.js";

function fakeDrive() {
  return {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      export: vi.fn(),
    },
  };
}

describe("googleDriveService", () => {
  it("pagina até o fim, ignora atalhos e normaliza os campos", async () => {
    const drive = fakeDrive();
    drive.files.list
      .mockResolvedValueOnce({
        data: {
          nextPageToken: "p2",
          files: [{ id: "1", name: "a.pdf", mimeType: "application/pdf", size: "42", modifiedTime: "t", webViewLink: "l" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            { id: "2", name: "Doc", mimeType: "application/vnd.google-apps.document" },
            { id: "3", name: "atalho", mimeType: "application/vnd.google-apps.shortcut" },
          ],
        },
      });
    const service = createGoogleDriveService({ folderId: "PASTA_ID", drive });
    const files = await service.listDriveFiles();
    expect(files).toEqual([
      { id: "1", name: "a.pdf", mimeType: "application/pdf", size: 42, modifiedTime: "t", webViewLink: "l" },
      { id: "2", name: "Doc", mimeType: "application/vnd.google-apps.document", size: null, modifiedTime: null, webViewLink: null },
    ]);
    expect(drive.files.list).toHaveBeenCalledTimes(2);
    const firstQuery = drive.files.list.mock.calls[0][0];
    expect(firstQuery.q).toContain("'PASTA_ID' in parents");
    expect(firstQuery.q).toContain("trashed = false");
    expect(firstQuery.q).toContain("mimeType != 'application/vnd.google-apps.folder'");
    expect(drive.files.list.mock.calls[1][0].pageToken).toBe("p2");
  });

  it("exporta Docs/Sheets/Slides para DOCX/XLSX/PPTX com nome e MIME corretos", () => {
    expect(finalFileInfo({ name: "Relatório", mimeType: "application/vnd.google-apps.document" })).toMatchObject({
      name: "Relatório.docx",
      exported: true,
    });
    expect(finalFileInfo({ name: "Notas", mimeType: "application/vnd.google-apps.spreadsheet" }).name).toBe("Notas.xlsx");
    expect(finalFileInfo({ name: "Aula.pptx", mimeType: "application/vnd.google-apps.presentation" }).name).toBe("Aula.pptx");
    expect(finalFileInfo({ name: "foto.png", mimeType: "image/png" })).toEqual({
      name: "foto.png",
      mimeType: "image/png",
      exported: false,
    });
  });

  it("baixa binários por streaming (alt=media)", async () => {
    const drive = fakeDrive();
    const stream = streamOf("pdf");
    drive.files.get.mockResolvedValue({ data: stream });
    const service = createGoogleDriveService({ folderId: "PASTA_ID", drive });
    const out = await service.downloadDriveFile("1", { id: "1", name: "a.pdf", mimeType: "application/pdf", size: 3 });
    expect(out).toMatchObject({ name: "a.pdf", mimeType: "application/pdf", exported: false, stream });
    expect(drive.files.get.mock.calls[0][0]).toMatchObject({ fileId: "1", alt: "media" });
    expect(drive.files.get.mock.calls[0][1]).toEqual({ responseType: "stream" });
  });

  it("exporta nativos do Google por streaming", async () => {
    const drive = fakeDrive();
    drive.files.export.mockResolvedValue({ data: streamOf("docx") });
    const service = createGoogleDriveService({ folderId: "PASTA_ID", drive });
    const out = await service.downloadDriveFile("2", { id: "2", name: "Doc", mimeType: "application/vnd.google-apps.document" });
    expect(out.name).toBe("Doc.docx");
    expect(out.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(drive.files.export.mock.calls[0][0]).toEqual({
      fileId: "2",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("recusa nativos sem exportação suportada (ex.: Formulários)", async () => {
    const drive = fakeDrive();
    const service = createGoogleDriveService({ folderId: "PASTA_ID", drive });
    await expect(
      service.downloadDriveFile("3", { id: "3", name: "Form", mimeType: "application/vnd.google-apps.form" }),
    ).rejects.toThrow("sem exportação suportada");
  });

  it("traduz 403/404/credencial inválida em mensagens claras", async () => {
    expect(translateDriveError({ code: 403, message: "forbidden" }).message).toContain("Compartilhe a pasta");
    expect(translateDriveError({ code: 404, message: "File not found: XYZ" }).message).toContain("GOOGLE_DRIVE_FOLDER_ID");
    expect(translateDriveError({ message: "invalid_grant: bad" }).message).toContain("Credenciais do Google");
    const drive = fakeDrive();
    drive.files.list.mockRejectedValue({ code: 404, message: "File not found: PASTA_ID" });
    const service = createGoogleDriveService({ folderId: "PASTA_ID", drive });
    await expect(service.listDriveFiles()).rejects.toMatchObject({ status: 502, code: "drive_nao_encontrado" });
  });
});
