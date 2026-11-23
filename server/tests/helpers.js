import { Readable } from "node:stream";
import { vi } from "vitest";

/** Credencial FALSA, só para testes (não é uma chave real). */
export const FAKE_SERVICE_ACCOUNT = {
  type: "service_account",
  client_email: "teste@projeto-ficticio.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nFICTICIA\n-----END PRIVATE KEY-----\n",
};

export const FAKE_CONNECTION_STRING =
  "DefaultEndpointsProtocol=https;AccountName=contaficticia;AccountKey=Q0hBVkVGSUNUSUNJQQ==;EndpointSuffix=core.windows.net";

export function validEnv(overrides = {}) {
  return {
    PORT: "3000",
    GOOGLE_DRIVE_FOLDER_ID: "1AbCdEfGhIjKlMnOpQrStUv",
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify(FAKE_SERVICE_ACCOUNT)).toString("base64"),
    AZURE_STORAGE_CONNECTION_STRING: FAKE_CONNECTION_STRING,
    AZURE_STORAGE_CONTAINER: "P2_Allan_ribeiro",
    CORS_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}

export function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };
}

export function streamOf(text = "conteudo") {
  return Readable.from([Buffer.from(text)]);
}
