/**
 * Erro com mensagem segura para o usuário final (sem segredos, IDs internos ou stack).
 * `status` é o código HTTP que a API deve devolver.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = "erro_interno", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function safeMessage(err, fallback = "Erro inesperado. Consulte os logs do servidor.") {
  return err instanceof AppError ? err.message : fallback;
}

/** Código HTTP do erro de um SDK (googleapis usa `code`/`status`, o SDK do Azure usa `statusCode`). */
export function httpStatusOf(err) {
  const v = err?.statusCode ?? err?.status ?? err?.response?.status ?? err?.code;
  const n = Number(v);
  return Number.isInteger(n) && n >= 100 && n < 600 ? n : undefined;
}

/** Remove credenciais conhecidas de um texto antes de ir para o console. */
export function redact(text) {
  return String(text ?? "")
    .replace(/AccountKey=[^;\s]+/gi, "AccountKey=***")
    .replace(/SharedAccessSignature=[^;\s]+/gi, "SharedAccessSignature=***")
    .replace(/([?&]sig=)[^&\s]+/gi, "$1***")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "***")
    .replace(/(Bearer\s+)[\w.~+/-]+=*/gi, "$1***");
}

/** Registra o erro técnico no console sem segredos. */
export function logError(logger, context, err) {
  const status = httpStatusOf(err);
  const detail = redact(err?.cause?.message || err?.message || String(err));
  logger.error(`[erro] ${context}${status ? ` (HTTP ${status})` : ""}: ${detail}`);
}
