import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApiRouter } from "./routes/api.js";

/**
 * CORS restrito: libera apenas as origens de CORS_ORIGIN (dev) e a própria origem do servidor (produção).
 */
export function corsMiddleware(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    const sameOrigin = [`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin);
    if (allowed.has(origin) || sameOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.status(204).end();
      return next();
    }
    if (req.method === "OPTIONS") return res.status(403).end();
    return res.status(403).json({ error: "Origem não permitida." });
  };
}

function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

/**
 * Monta o app Express. `clientDist` é a pasta do build do React servida na mesma URL.
 */
export function createApp({ driveService, blobService, syncService, publicInfo, corsOrigin = [], clientDist, logger = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use("/api", corsMiddleware(corsOrigin));
  app.use("/api", createApiRouter({ driveService, blobService, syncService, publicInfo, logger }));

  if (clientDist && existsSync(join(clientDist, "index.html"))) {
    const indexFile = join(clientDist, "index.html");
    app.use(express.static(clientDist, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(indexFile);
    });
  }
  return app;
}
