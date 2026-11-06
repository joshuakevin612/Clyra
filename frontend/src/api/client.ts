import type { ApiErrorBody, ErrorCode } from "./types";
let token: string | null = null;
let expiresAt = 0;
// Mock mode is opt-in only (VITE_API_BASE_URL=mock). An unset value uses the
// same-origin real API; it never falls back to mocks implicitly.
export const mockMode = import.meta.env.VITE_API_BASE_URL === "mock";
const base = mockMode
  ? "/api/v1"
  : (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
export function setSession(value: string | null, expiry?: string) {
  token = value;
  expiresAt = expiry ? Date.parse(expiry) : 0;
}
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details: ApiErrorBody["error"]["details"] = [],
  ) {
    super(message);
  }
}
export async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (token && Date.now() >= expiresAt) {
    setSession(null);
    window.dispatchEvent(new Event("session-ended"));
    throw new ApiError(
      "UNAUTHENTICATED",
      "Your session expired. Sign in again.",
    );
  }
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Unable to connect. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    const code = body?.error?.code ?? "INTERNAL_ERROR";
    if (code === "ACCOUNT_DISABLED" || code === "UNAUTHENTICATED") {
      setSession(null);
      window.dispatchEvent(new Event("session-ended"));
    }
    throw new ApiError(
      code,
      body?.error?.message ?? "The request could not be completed.",
      body?.error?.details ?? [],
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const send = <T = unknown>(
  path: string,
  body: unknown,
  method = "POST",
) => request<T>(path, { method, body: JSON.stringify(body) });
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "VERSION_CONFLICT":
      return "This record changed. Reload to see the latest,";
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "Record not found or unavailable to your account.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait before trying again.";
    case "ACCOUNT_DISABLED":
      return "Your account is disabled. Contact your organisation administrator.";
    case "INVALID_CREDENTIALS":
      return "The username or password is incorrect.";
    case "LAST_ADMIN_PROTECTED":
      return "The organisation must keep at least one active administrator.";
    case "MIGRATION_NOT_PENDING":
      return "This migration is no longer awaiting a decision. Reload to see its status.";
    case "EXTRACTION_PENDING":
      return "Extraction is still processing.";
    default:
      return error.message;
  }
}
export async function requestPages<
  T extends { items: unknown[]; nextCursor: string | null },
>(path: string): Promise<T> {
  const first = await request<T>(path);
  let cursor = first.nextCursor;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor))
      throw new ApiError(
        "INTERNAL_ERROR",
        "The record list could not be fully loaded. Try again.",
      );
    seen.add(cursor);
    const next = await request<T>(
      path +
        (path.includes("?") ? "&" : "?") +
        "cursor=" +
        encodeURIComponent(cursor),
    );
    first.items.push(...next.items);
    cursor = next.nextCursor;
  }
  first.nextCursor = null;
  return first;
}
