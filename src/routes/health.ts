import { jsonResponse } from "../lib/json";

export function handleHealth(): Response {
  return jsonResponse(200, { ok: true });
}
