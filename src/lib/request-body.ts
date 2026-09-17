export class RequestBodyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Enforce bytes while streaming, also for chunked requests without Content-Length. */
export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RequestBodyError("Formato inválido.", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new RequestBodyError("Solicitação muito grande.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Dados inválidos.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError("Solicitação muito grande.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestBodyError("Dados inválidos.", 400); }
}
