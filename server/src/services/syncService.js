import { finalFileInfo } from "./googleDriveService.js";
import { AppError, logError, safeMessage } from "../utils/errors.js";

export const DEFAULT_CONCURRENCY = 3;

const NATIVE_LABEL = {
  "application/vnd.google-apps.document": "Google Docs",
  "application/vnd.google-apps.spreadsheet": "Google Sheets",
  "application/vnd.google-apps.presentation": "Google Slides",
};

/** Executa `worker` sobre `items` com no máximo `limit` tarefas simultâneas, preservando a ordem. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * @param {{ drive: { listDriveFiles, downloadDriveFile }, blob: { blobExists, uploadStream },
 *           logger?: Console, concurrency?: number, now?: () => number }} deps
 */
export function createSyncService({ drive, blob, logger = console, concurrency = DEFAULT_CONCURRENCY, now = Date.now }) {
  async function transfer(file, { overwrite, duplicate }) {
    const { name: blobName } = finalFileInfo(file);
    const base = { name: file.name, blobName };
    const started = now();
    logger.info(`[sync] iniciando: ${file.name} -> ${blobName}`);

    const finish = (status, message) => {
      const result = { ...base, status, message, durationMs: now() - started };
      const tag = { success: "OK", skipped: "IGNORADO", error: "ERRO" }[status];
      const line = `[sync] ${tag}: ${file.name} -> ${blobName} | ${message}`;
      if (status === "error") logger.error(line);
      else logger.info(line);
      return result;
    };

    if (duplicate) {
      return finish("skipped", "Outro arquivo da pasta gera o mesmo nome de blob; renomeie no Drive para copiar este também.");
    }

    try {
      if (!overwrite && (await blob.blobExists(blobName))) {
        return finish("skipped", "Já existe no contêiner (use 'Sobrescrever' para substituir).");
      }
    } catch (err) {
      logError(logger, `verificar ${blobName}`, err);
      return finish("error", `Falha ao verificar o destino: ${safeMessage(err)}`);
    }

    let download;
    try {
      download = await drive.downloadDriveFile(file.id, file);
    } catch (err) {
      logError(logger, `baixar ${file.name}`, err);
      return finish("error", `Falha no download: ${safeMessage(err)}`);
    }

    try {
      await blob.uploadStream(
        blobName,
        download.stream,
        download.mimeType,
        {
          driveFileId: file.id,
          driveModifiedTime: file.modifiedTime,
          driveMimeType: file.mimeType,
          sourceName: file.name,
        },
        { overwrite },
      );
    } catch (err) {
      download.stream?.destroy?.();
      if (err instanceof AppError && err.code === "blob_existe" && !overwrite) {
        return finish("skipped", "Já existe no contêiner (criado durante a sincronização).");
      }
      logError(logger, `enviar ${blobName}`, err);
      return finish("error", `Falha no upload: ${safeMessage(err)}`);
    }

    const note = download.exported ? ` (exportado de ${NATIVE_LABEL[file.mimeType] ?? "Google"} para ${blobName.split(".").pop().toUpperCase()})` : "";
    return finish("success", `${overwrite ? "Copiado (sobrescrito se existia)" : "Copiado"}${note}.`);
  }

  /**
   * Copia todos os arquivos da pasta do Drive para o contêiner.
   * Um erro em um arquivo não interrompe os demais.
   */
  async function syncFiles({ overwrite = false } = {}) {
    const startedAt = new Date(now()).toISOString();
    const files = await drive.listDriveFiles();
    logger.info(`[sync] ${files.length} arquivo(s) na origem; sobrescrever=${overwrite}; concorrência=${concurrency}`);

    const seen = new Set();
    const plan = files.map((file) => {
      const key = finalFileInfo(file).name;
      const duplicate = seen.has(key);
      seen.add(key);
      return { file, duplicate };
    });

    const results = await mapWithConcurrency(plan, concurrency, ({ file, duplicate }) =>
      transfer(file, { overwrite, duplicate }).catch((err) => {
        logError(logger, `transferir ${file.name}`, err);
        return { name: file.name, blobName: file.name, status: "error", message: safeMessage(err) };
      }),
    );

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      overwrite,
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      results,
    };
    logger.info(
      `[sync] concluído: total=${summary.total} sucesso=${summary.success} ignorados=${summary.skipped} erros=${summary.errors}`,
    );
    return summary;
  }

  return { syncFiles };
}
