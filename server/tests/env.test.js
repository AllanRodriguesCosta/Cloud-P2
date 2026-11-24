import { describe, expect, it } from "vitest";
import {
  ConfigError,
  isValidAzureContainerName,
  loadConfig,
  publicConfig,
  toAzureContainerName,
} from "../src/config/env.js";
import { FAKE_CONNECTION_STRING, FAKE_SERVICE_ACCOUNT, validEnv } from "./helpers.js";

function problemsOf(env) {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err.problems.join("\n");
  }
  throw new Error("esperava ConfigError");
}

describe("validação de ambiente", () => {
  it("aceita um ambiente completo e decodifica a Service Account só em memória", () => {
    const config = loadConfig(validEnv());
    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.driveFolderId).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(config.googleCredentials.client_email).toBe(FAKE_SERVICE_ACCOUNT.client_email);
    expect(config.corsOrigin).toEqual(["http://localhost:5173"]);
  });

  it("converte P2_Allan_ribeiro para um nome aceito pelo Azure", () => {
    const config = loadConfig(validEnv());
    expect(config.containerRequested).toBe("P2_Allan_ribeiro");
    expect(config.containerName).toBe("p2-allan-ribeiro");
    expect(toAzureContainerName("P2_Allan_ribeiro")).toBe("p2-allan-ribeiro");
    expect(isValidAzureContainerName("p2-allan-ribeiro")).toBe(true);
    expect(isValidAzureContainerName("P2_Allan_ribeiro")).toBe(false);
  });

  it("lista todas as variáveis obrigatórias ausentes", () => {
    const text = problemsOf({});
    expect(text).toContain("GOOGLE_DRIVE_FOLDER_ID");
    expect(text).toContain("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
    expect(text).toContain("AZURE_STORAGE_CONNECTION_STRING ou AZURE_STORAGE_SAS_URL");
  });

  it("recusa o placeholder do .env.example e URLs no lugar do ID", () => {
    expect(problemsOf(validEnv({ GOOGLE_DRIVE_FOLDER_ID: "COLE_O_ID_DA_PASTA" }))).toContain("GOOGLE_DRIVE_FOLDER_ID");
    expect(
      problemsOf(validEnv({ GOOGLE_DRIVE_FOLDER_ID: "https://drive.google.com/drive/folders/abc" })),
    ).toContain("só o ID");
  });

  it("recusa Base64 inválido sem citar o valor", () => {
    const text = problemsOf(validEnv({ GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "nao-e-base64-json" }));
    expect(text).toContain("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
    expect(text).not.toContain("nao-e-base64-json");
  });

  it("recusa JSON sem client_email/private_key", () => {
    const b64 = Buffer.from(JSON.stringify({ type: "service_account" })).toString("base64");
    expect(problemsOf(validEnv({ GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: b64 }))).toContain("client_email");
  });

  it("recusa Connection String malformada, porta e contêiner inválidos sem vazar segredo", () => {
    const text = problemsOf(
      validEnv({ AZURE_STORAGE_CONNECTION_STRING: "segredo-qualquer", PORT: "abc", AZURE_STORAGE_CONTAINER: "x" }),
    );
    expect(text).toContain("AZURE_STORAGE_CONNECTION_STRING");
    expect(text).toContain("PORT");
    expect(text).toContain("AZURE_STORAGE_CONTAINER");
    expect(text).not.toContain("segredo-qualquer");
  });

  it("aceita URL SAS como alternativa à Connection String sem expô-la na configuração pública", () => {
    const sasUrl = "https://contaficticia.blob.core.windows.net/?sv=2026-01-01&sig=falso";
    const config = loadConfig(validEnv({ AZURE_STORAGE_CONNECTION_STRING: "", AZURE_STORAGE_SAS_URL: sasUrl }));
    expect(config.azureSasUrl).toBe(sasUrl);
    expect(JSON.stringify(publicConfig(config))).not.toContain(sasUrl);
  });

  it("recusa URL SAS malformada sem vazar o valor", () => {
    const text = problemsOf(validEnv({ AZURE_STORAGE_SAS_URL: "segredo-invalido" }));
    expect(text).toContain("AZURE_STORAGE_SAS_URL");
    expect(text).not.toContain("segredo-invalido");
  });

  it("aceita GOOGLE_APPLICATION_CREDENTIALS como alternativa local", () => {
    const env = validEnv({ GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "", GOOGLE_APPLICATION_CREDENTIALS: "./nao-existe.json" });
    expect(problemsOf(env)).toContain("GOOGLE_APPLICATION_CREDENTIALS");
  });

  it("publicConfig não expõe credenciais", () => {
    const pub = JSON.stringify(publicConfig(loadConfig(validEnv())));
    expect(pub).not.toContain("AccountKey");
    expect(pub).not.toContain(FAKE_CONNECTION_STRING);
    expect(pub).not.toContain("PRIVATE KEY");
    expect(pub).toContain("p2-allan-ribeiro");
  });
});
