const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "—";
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const text = i === 0 ? String(n) : n.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${text} ${UNITS[i]}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const FRIENDLY = {
  "application/vnd.google-apps.document": "Documento Google",
  "application/vnd.google-apps.spreadsheet": "Planilha Google",
  "application/vnd.google-apps.presentation": "Apresentação Google",
  "application/vnd.google-apps.form": "Formulário Google",
  "application/vnd.google-apps.drawing": "Desenho Google",
  "application/pdf": "PDF",
  "image/png": "Imagem PNG",
  "image/jpeg": "Imagem JPEG",
  "text/plain": "Texto",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (DOCX)",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (XLSX)",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint (PPTX)",
};

export function formatType(mime) {
  if (!mime) return "—";
  return FRIENDLY[mime] || mime;
}
