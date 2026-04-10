/**
 * Checkpoint Harmony Email & Collaboration HTTP client.
 *
 * Implements the HEC Smart API v1.50:
 * - Auth: POST /auth/external → JWT with region claim
 * - Scopes: GET /v1.0/scopes → available API scopes for this key
 * - Data: regional base URL derived from JWT region claim
 *
 * Required headers on all data requests:
 *   Authorization: Bearer {token}
 *   x-av-req-id: {fresh UUID per request}
 *   scopes: {scope string from /v1.0/scopes}
 */

import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import type { CheckpointCredentials, ApiResponse } from "./types.js";
import { REGIONAL_BASE_URLS, DEFAULT_BASE_URL } from "./types.js";

const AUTH_PATH = "/auth/external";
const SCOPES_PATH = "/app/hec-api/v1.0/scopes";

// Cached per-process state (invalidated when credentials change)
let _token: string | null = null;
let _tokenExpiresAt: number = 0;
let _scope: string = "";
let _baseUrl: string = DEFAULT_BASE_URL;
let _lastCredentials: CheckpointCredentials | null = null;

export function getCredentials(): CheckpointCredentials | null {
  const clientId = process.env.CHECKPOINT_CLIENT_ID;
  const clientSecret = process.env.CHECKPOINT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn("Missing Checkpoint credentials", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  return {
    clientId,
    clientSecret,
    region: process.env.CHECKPOINT_REGION,
  };
}

function credentialsChanged(creds: CheckpointCredentials): boolean {
  if (!_lastCredentials) return true;
  return (
    creds.clientId !== _lastCredentials.clientId ||
    creds.clientSecret !== _lastCredentials.clientSecret
  );
}

function decodeJwtRegion(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(decoded) as Record<string, unknown>;
    return typeof claims.region === "string" ? claims.region : null;
  } catch {
    return null;
  }
}

async function refreshToken(creds: CheckpointCredentials): Promise<void> {
  // Auth always goes to the global gateway regardless of region
  const authUrl = `${DEFAULT_BASE_URL}${AUTH_PATH}`;
  logger.debug("Requesting Checkpoint auth token", { authUrl });

  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ clientId: creds.clientId, accessKey: creds.clientSecret }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`Auth request failed (${res.status}): non-JSON response`);
  }

  if (!res.ok || !body.success) {
    const msg = typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
    throw new Error(`Authentication failed: ${msg}`);
  }

  const data = body.data as Record<string, unknown>;
  const token = data?.token as string;
  if (!token) throw new Error("Auth response missing token");

  _token = token;
  // Tokens expire in 30 min; refresh 60s early
  const expiresIn = (data.expiresIn as number) || 1800;
  _tokenExpiresAt = Date.now() + expiresIn * 1000;

  // Detect regional base URL from JWT
  const region = creds.region || decodeJwtRegion(token);
  _baseUrl = (region && REGIONAL_BASE_URLS[region]) || DEFAULT_BASE_URL;
  logger.debug("Auth token obtained", { region, baseUrl: _baseUrl });
}

async function refreshScopes(): Promise<void> {
  if (!_token) return;

  const res = await fetch(`${_baseUrl}${SCOPES_PATH}`, {
    headers: {
      Authorization: `Bearer ${_token}`,
      "x-av-req-id": randomUUID(),
      scopes: "",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.warn("Failed to fetch scopes, using empty scope", { status: res.status });
    _scope = "";
    return;
  }

  const body = (await res.json()) as ApiResponse<string>;
  _scope = (body.responseData?.[0] ?? "") as string;
  logger.debug("Scopes fetched", { scope: _scope });
}

async function ensureAuth(): Promise<void> {
  const creds = getCredentials();
  if (!creds) throw new Error("No Checkpoint credentials configured");

  if (credentialsChanged(creds)) {
    _token = null;
    _tokenExpiresAt = 0;
    _scope = "";
    _lastCredentials = creds;
  }

  if (!_token || Date.now() >= _tokenExpiresAt - 60_000) {
    await refreshToken(creds);
    await refreshScopes();
  }
}

/**
 * Make an authenticated request to the HEC Smart API.
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<ApiResponse<T>> {
  await ensureAuth();

  const url = new URL(`${_baseUrl}/app/hec-api${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${_token}`,
    "x-av-req-id": randomUUID(),
    scopes: _scope,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug("HEC API request", { method, url: url.toString() });
  const res = await fetch(url.toString(), fetchOptions);

  const raw = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`HEC API returned non-JSON (${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg =
      body &&
      typeof body === "object" &&
      "message" in body
        ? String((body as Record<string, unknown>).message)
        : `HTTP ${res.status}`;

    if (res.status === 401) {
      // Force re-auth on next call
      _token = null;
      _tokenExpiresAt = 0;
    }

    logger.error("HEC API error", { status: res.status, url: url.toString(), msg });
    throw new Error(`HEC API error (${res.status}): ${msg}`);
  }

  return body as ApiResponse<T>;
}

export function clearCredentials(): void {
  _token = null;
  _tokenExpiresAt = 0;
  _scope = "";
  _lastCredentials = null;
}
