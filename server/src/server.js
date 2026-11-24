import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ConfigError, loadConfig, publicConfig } from "./config/env.js";
import { createDriveClient, createGoogleDriveService } from "./services/googleDriveService.js";
import { createAzureBlobService, createContainerClient } from "./services/azureBlobService.js";
import { createSyncService } from "./services/syncService.js";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, "../../client/dist");

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`${err.message}\nCopie .env.example para .env e preencha os valores (veja o README).`);
      process.exit(1);
    }
    throw err;
  }

  const drive = await createDriveClient(config.googleCredentials);
  const containerClient = await createContainerClient({
    connectionString: config.azureConnectionString,
    sasUrl: config.azureSasUrl,
    containerName: config.containerName,
  });
  const driveService = createGoogleDriveService({ folderId: config.driveFolderId, drive });
  const blobService = createAzureBlobService({ containerClient });
  const syncService = createSyncService({ drive: driveService, blob: blobService });

  const info = publicConfig(config);
  const app = createApp({
    driveService,
    blobService,
    syncService,
    publicInfo: info,
    corsOrigin: config.corsOrigin,
    clientDist,
  });

  app.listen(config.port, config.host, () => {
    console.info(`[servidor] ouvindo em http://${config.host}:${config.port}`);
    console.info(`[servidor] contêiner: ${info.container} (nome no Azure: ${info.azureContainer})`);
  });

  blobService.ensureContainer().then(
    () => console.info("[servidor] contêiner pronto no Azure."),
    (err) => console.error(`[servidor] aviso: contêiner ainda indisponível: ${err.message}`),
  );
}

main().catch((err) => {
  console.error("[servidor] falha ao iniciar:", err?.message || err);
  process.exit(1);
});
