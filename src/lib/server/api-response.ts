import type { ApiError, ApiErrorCode } from "@/types/quiz";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
): Response {
  const body: ApiError = { error: { code, message } };
  return jsonResponse(body, status);
}
