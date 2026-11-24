import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class ConfigError extends Error {
  constructor(problems) {
    super(`Configuração inválida:\n - ${problems.join("\n - ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Nome exigido pela atividade. */
export const REQUIRED_CONTAINER = "P2_Allan_ribeiro";

/**
 * O Azure só aceita nomes de contêiner com 3 a 63 caracteres: minúsculas, números e hífens,
 * começando e terminando com letra ou número, sem hífens duplos.
 * "P2_Allan_ribeiro" é convertido para "p2-allan-ribeiro" (o portal do Azure também recusaria o original).
 */
export function toAzureContainerName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s.]+/g, "-")
    .replace(/-{2,}/g, "-");
}

export function isValidAzureContainerName(name) {
  return /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/.test(name);
}

function decodeServiceAccount(base64) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(base64.trim(), "base64").toString("utf8"));
  } catch {
    return { error: "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 não é um JSON válido em Base64." };
  }
  return checkServiceAccount(parsed, "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
}

function readServiceAccountFile(path, cwd) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(cwd, path), "utf8"));
  } catch {
    return { error: "GOOGLE_APPLICATION_CREDENTIALS aponta para um arquivo inexistente ou inválido." };
  }
  return checkServiceAccount(parsed, "GOOGLE_APPLICATION_CREDENTIALS");
}

function checkServiceAccount(json, source) {
  if (!json || typeof json !== "object" || !json.client_email || !json.private_key) {
    return { error: `${source} não contém uma chave de Service Account (faltam client_email/private_key).` };
  }
  return { credentials: json };
}

/**
 * Lê e valida o ambiente. Lança ConfigError listando o que falta, sem nunca citar valores secretos.
 * @param {Record<string,string|undefined>} env
 */
export function loadConfig(env = process.env, { cwd = process.cwd() } = {}) {
  const problems = [];
  const value = (k) => (typeof env[k] === "string" ? env[k].trim() : "");

  const portRaw = value("PORT") || "3000";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT deve ser um número entre 1 e 65535.");

  const driveFolderId = value("GOOGLE_DRIVE_FOLDER_ID");
  if (!driveFolderId || driveFolderId === "COLE_O_ID_DA_PASTA") {
    problems.push("GOOGLE_DRIVE_FOLDER_ID é obrigatório (ID da pasta do Google Drive).");
  } else if (!/^[\w-]{10,}$/.test(driveFolderId)) {
    problems.push("GOOGLE_DRIVE_FOLDER_ID deve ser só o ID da pasta, não a URL inteira.");
  }

  let googleCredentials;
  const b64 = value("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const keyFile = value("GOOGLE_APPLICATION_CREDENTIALS");
  if (b64) {
    const r = decodeServiceAccount(b64);
    if (r.error) problems.push(r.error);
    else googleCredentials = r.credentials;
  } else if (keyFile) {
    const r = readServiceAccountFile(keyFile, cwd);
    if (r.error) problems.push(r.error);
    else googleCredentials = r.credentials;
  } else {
    problems.push("Defina GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (recomendado) ou GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const azureConnectionString = value("AZURE_STORAGE_CONNECTION_STRING");
  const azureSasUrl = value("AZURE_STORAGE_SAS_URL");
  if (!azureConnectionString && !azureSasUrl) {
    problems.push("Defina AZURE_STORAGE_CONNECTION_STRING ou AZURE_STORAGE_SAS_URL.");
  } else if (azureConnectionString && !/(AccountName=|BlobEndpoint=)/i.test(azureConnectionString)) {
    problems.push("AZURE_STORAGE_CONNECTION_STRING não parece uma Connection String do Azure Storage.");
  } else if (azureSasUrl && !/^https:\/\/.+\?.+/i.test(azureSasUrl)) {
    problems.push("AZURE_STORAGE_SAS_URL deve ser uma URL HTTPS com token SAS.");
  }

  const containerRequested = value("AZURE_STORAGE_CONTAINER") || REQUIRED_CONTAINER;
  const containerName = toAzureContainerName(containerRequested);
  if (!isValidAzureContainerName(containerName)) {
    problems.push(
      "AZURE_STORAGE_CONTAINER inválido: use 3 a 63 caracteres, minúsculas, números e hífens (ex.: p2-allan-ribeiro).",
    );
  }

  const corsOrigin = value("CORS_ORIGIN")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    port,
    host: "0.0.0.0",
    isProduction: value("NODE_ENV") === "production",
    driveFolderId,
    googleCredentials,
    azureConnectionString,
    azureSasUrl,
    containerRequested,
    containerName,
    corsOrigin,
  });
}

/** Versão sem segredos, para logs e para o frontend. */
export function publicConfig(config) {
  return {
    container: config.containerRequested,
    azureContainer: config.containerName,
  };
}
