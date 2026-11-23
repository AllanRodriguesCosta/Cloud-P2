import express, { Router } from "express";
import { AppError, logError, safeMessage } from "../utils/errors.js";

/**
 * Rotas da API. Os serviços são injetados para permitir testes com mocks.
 * @param {{ driveService, blobService, syncService, publicInfo, logger? }} deps
 */
export function createApiRouter({ driveService, blobService, syncService, publicInfo = {}, logger = console }) {
  const router = Router();
  let syncRunning = false;

  router.use(express.json({ limit: "10kb" }));

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/info", (_req, res) => {
    res.json(publicInfo);
  });

  router.get("/source", async (_req, res) => {
    const files = await driveService.listDriveFiles();
    res.json({ total: files.length, files });
  });

  router.get("/destination", async (_req, res) => {
    const blobs = await blobService.listBlobs();
    res.json({ container: publicInfo.azureContainer, total: blobs.length, blobs });
  });

  router.post("/sync", async (req, res) => {
    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("O corpo deve ser um objeto JSON, por exemplo { \"overwrite\": false }.", { status: 400 });
    }
    if (body.overwrite !== undefined && typeof body.overwrite !== "boolean") {
      throw new AppError("O campo overwrite deve ser true ou false.", { status: 400 });
    }
    if (syncRunning) {
      throw new AppError("Já existe uma sincronização em andamento. Aguarde terminar.", { status: 409 });
    }
    syncRunning = true;
    try {
      const summary = await syncService.syncFiles({ overwrite: body.overwrite === true });
      res.json(summary);
    } finally {
      syncRunning = false;
    }
  });

  router.use((req, res) => {
    res.status(404).json({ error: `Rota não encontrada: ${req.method} /api${req.path}` });
  });

  router.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido no corpo da requisição." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Corpo da requisição muito grande." });
    const status = err instanceof AppError ? err.status : 500;
    if (status >= 500) logError(logger, "API", err);
    res.status(status).json({ error: safeMessage(err) });
  });

  return router;
}
