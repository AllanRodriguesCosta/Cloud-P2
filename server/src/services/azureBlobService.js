import { AppError, httpStatusOf } from "../utils/errors.js";

const UPLOAD_BUFFER = 4 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

export function translateAzureError(err) {
  if (err instanceof AppError) return err;
  const status = httpStatusOf(err);
  const code = String(err?.code || err?.details?.errorCode || "");
  if (code === "BlobAlreadyExists" || code === "ConditionNotMet" || status === 409 || status === 412) {
    return new AppError("O blob já existe no contêiner.", { status: 409, code: "blob_existe", cause: err });
  }
  if (status === 403 || code.startsWith("Authentication") || code.startsWith("Authorization")) {
    return new AppError("Sem permissão no Azure Blob Storage. Confira a Connection String da conta de armazenamento.", {
      status: 502, code: "azure_permissao", cause: err,
    });
  }
  if (code === "ContainerNotFound" || (status === 404 && !code.startsWith("Blob"))) {
    return new AppError("Contêiner do Azure não encontrado.", { status: 502, code: "azure_conteiner", cause: err });
  }
  if (code === "InvalidResourceName") {
    return new AppError("Nome de contêiner ou blob inválido para o Azure.", { status: 400, code: "azure_nome", cause: err });
  }
  if (err?.name === "RestError" && !status) {
    return new AppError("Não foi possível conectar ao Azure Blob Storage (rede ou endereço da conta).", {
      status: 502, code: "azure_rede", cause: err,
    });
  }
  return new AppError("Falha ao acessar o Azure Blob Storage.", { status: 502, code: "azure_falha", cause: err });
}

/** Cria o ContainerClient oficial (@azure/storage-blob). A Connection String nunca sai do backend. */
export async function createContainerClient({ connectionString, sasUrl, containerName }) {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const service = sasUrl ? new BlobServiceClient(sasUrl) : BlobServiceClient.fromConnectionString(connectionString);
  return service.getContainerClient(containerName);
}

/** Metadados do Azure aceitam apenas ASCII: valores são codificados. */
export function toBlobMetadata(metadata = {}) {
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null || value === "") continue;
    const safeKey = key.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
    out[safeKey] = encodeURIComponent(String(value));
  }
  return out;
}

/** @param {{ containerClient: any }} deps */
export function createAzureBlobService({ containerClient }) {
  if (!containerClient) throw new Error("containerClient é obrigatório");
  let ready;

  /** Obtém ou cria o contêiner (privado: sem acesso público). Executa uma vez. */
  function ensureContainer() {
    ready ??= containerClient.createIfNotExists().catch((err) => {
      ready = undefined;
      throw translateAzureError(err);
    });
    return ready;
  }

  async function listBlobs() {
    await ensureContainer();
    const blobs = [];
    try {
      for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
        const p = blob.properties ?? {};
        blobs.push({
          name: blob.name,
          contentLength: p.contentLength ?? null,
          contentType: p.contentType ?? null,
          lastModified: p.lastModified ? new Date(p.lastModified).toISOString() : null,
          metadata: decodeMetadata(blob.metadata),
        });
      }
    } catch (err) {
      throw translateAzureError(err);
    }
    return blobs;
  }

  async function blobExists(name) {
    await ensureContainer();
    try {
      return await containerClient.getBlockBlobClient(name).exists();
    } catch (err) {
      throw translateAzureError(err);
    }
  }

  /**
   * Envia em streaming preservando nome e MIME type.
   * Sem `overwrite`, a escrita é condicional (If-None-Match: *) e falha se o blob já existir.
   */
  async function uploadStream(name, stream, contentType, metadata = {}, { overwrite = false } = {}) {
    await ensureContainer();
    try {
      const client = containerClient.getBlockBlobClient(name);
      await client.uploadStream(stream, UPLOAD_BUFFER, UPLOAD_CONCURRENCY, {
        blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" },
        metadata: toBlobMetadata(metadata),
        conditions: overwrite ? undefined : { ifNoneMatch: "*" },
      });
      return { name };
    } catch (err) {
      throw translateAzureError(err);
    }
  }

  return { ensureContainer, listBlobs, blobExists, uploadStream };
}

function decodeMetadata(metadata) {
  if (!metadata) return {};
  const out = {};
  for (const [k, v] of Object.entries(metadata)) {
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
