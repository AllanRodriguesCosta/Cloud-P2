import { AppError, httpStatusOf } from "../utils/errors.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const LIST_FIELDS = "nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)";

/** Arquivos nativos do Google exportados para formatos previsíveis do Office. */
export const GOOGLE_EXPORTS = Object.freeze({
  "application/vnd.google-apps.document": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: ".pptx",
  },
});

export function isGoogleNative(mimeType) {
  return typeof mimeType === "string" && mimeType.startsWith("application/vnd.google-apps.");
}

/**
 * Nome e MIME type finais de um arquivo depois do download/exportação.
 * Nativos do Google ganham a extensão do formato exportado (sem duplicar se o nome já a tiver).
 */
export function finalFileInfo(file) {
  const exp = GOOGLE_EXPORTS[file.mimeType];
  if (!exp) return { name: file.name, mimeType: file.mimeType || "application/octet-stream", exported: false };
  const name = file.name.toLowerCase().endsWith(exp.extension) ? file.name : `${file.name}${exp.extension}`;
  return { name, mimeType: exp.mimeType, exported: true };
}

/** Traduz erros da API do Drive em mensagens claras e sem dados confidenciais. */
export function translateDriveError(err, what = "o Google Drive") {
  if (err instanceof AppError) return err;
  const status = httpStatusOf(err);
  const text = String(err?.message || "").toLowerCase();
  if (text.includes("invalid_grant") || text.includes("invalid jwt") || status === 401) {
    return new AppError("Credenciais do Google inválidas ou expiradas. Gere uma nova chave da Service Account.", {
      status: 502, code: "drive_credenciais", cause: err,
    });
  }
  if (status === 403) {
    return new AppError(
      "Sem permissão no Google Drive. Compartilhe a pasta com o e-mail da Service Account e confirme que a API do Drive está ativada.",
      { status: 502, code: "drive_permissao", cause: err },
    );
  }
  if (status === 404) {
    return new AppError(`Pasta ou arquivo não encontrado em ${what}. Confira GOOGLE_DRIVE_FOLDER_ID e o compartilhamento.`, {
      status: 502, code: "drive_nao_encontrado", cause: err,
    });
  }
  if (status === 429) {
    return new AppError("O Google Drive limitou as requisições. Tente novamente em alguns instantes.", {
      status: 503, code: "drive_limite", cause: err,
    });
  }
  return new AppError("Falha ao acessar o Google Drive.", { status: 502, code: "drive_falha", cause: err });
}

/** Cria o cliente oficial (googleapis) autenticado pela Service Account, somente leitura. */
export async function createDriveClient(credentials) {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/**
 * @param {{ folderId: string, drive: any }} deps  `drive` é um cliente drive v3 (real ou mock).
 */
export function createGoogleDriveService({ folderId, drive }) {
  if (!folderId) throw new Error("folderId é obrigatório");
  if (!drive) throw new Error("drive é obrigatório");
  const escapedFolder = folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function listDriveFiles() {
    const files = [];
    let pageToken;
    try {
      do {
        const { data } = await drive.files.list({
          q: `'${escapedFolder}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
          fields: LIST_FIELDS,
          pageSize: 1000,
          orderBy: "name",
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const f of data.files ?? []) {
          if (f.mimeType === SHORTCUT_MIME) continue;
          files.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size != null ? Number(f.size) : null,
            modifiedTime: f.modifiedTime ?? null,
            webViewLink: f.webViewLink ?? null,
          });
        }
        pageToken = data.nextPageToken || undefined;
      } while (pageToken);
    } catch (err) {
      throw translateDriveError(err, "a pasta configurada");
    }
    return files;
  }

  /**
   * Baixa (ou exporta) um arquivo como stream.
   * @returns {Promise<{ id, name, mimeType, size, modifiedTime, exported, stream }>}
   */
  async function downloadDriveFile(fileId, knownMeta) {
    try {
      const meta =
        knownMeta ??
        (
          await drive.files.get({
            fileId,
            fields: "id, name, mimeType, size, modifiedTime",
            supportsAllDrives: true,
          })
        ).data;
      const info = finalFileInfo(meta);
      let response;
      if (info.exported) {
        response = await drive.files.export({ fileId, mimeType: info.mimeType }, { responseType: "stream" });
      } else if (isGoogleNative(meta.mimeType)) {
        throw new AppError("Tipo nativo do Google sem exportação suportada (só Docs, Planilhas e Apresentações).", {
          status: 422, code: "drive_tipo_nao_suportado",
        });
      } else {
        response = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "stream" },
        );
      }
      return {
        id: meta.id ?? fileId,
        name: info.name,
        mimeType: info.mimeType,
        size: info.exported ? null : meta.size != null ? Number(meta.size) : null,
        modifiedTime: meta.modifiedTime ?? null,
        exported: info.exported,
        stream: response.data,
      };
    } catch (err) {
      throw translateDriveError(err, "o Google Drive");
    }
  }

  return { listDriveFiles, downloadDriveFile };
}
