/**
 * Checkpoint Harmony Email & Collaboration HTTP client.
 *
 * Implements the HEC Smart API v1.50.
 *
 * Auth: POST /auth/external → JWT with region claim
 * Scopes: GET /v1.0/scopes → list of "farm:customer" pairs for this key
 *   - Format: mt-prod-cp-eu-1:customername (EU), mt-prod-cp-1:customername (US)
 *   - Multi-scope keys must specify which scope to use per request
 *   - Single-scope keys can omit scopes (API uses the only available scope)
 *   - Keys returning [""] have no HEC farm association — contact Checkpoint support
 *
 * Required headers on all data requests:
 *   Authorization: Bearer {token}
 *   x-av-req-id: {fresh UUID per request}
 */

import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import {
  getRequestCredentials,
  getRequestTokenState,
  createDerivedTokenState,
  type DerivedTokenState,
} from "./credential-store.js";
import type { CheckpointCredentials, ApiResponse } from "./types.js";
import { REGIONAL_BASE_URLS, DEFAULT_BASE_URL } from "./types.js";

const AUTH_PATH = "/auth/external";
const SCOPES_PATH = "/app/hec-api/v1.0/scopes";

// Fallback derived-token cache for stdio/env mode only, where a single
// process serves exactly one tenant's credentials for its entire lifetime
// (there is no concurrent multi-tenant traffic to race). Gateway (HTTP,
// multi-tenant) mode never touches this: it gets its own per-request
// DerivedTokenState from credential-store.ts's AsyncLocalStorage instead,
// so concurrent tenants can never observe or overwrite each other's
// token/scopes/baseUrl.
let _fallbackTokenState: DerivedTokenState = createDerivedTokenState();

function getTokenState(): DerivedTokenState {
  return getRequestTokenState() ?? _fallbackTokenState;
}

/**
 * Get credentials from the per-request store (gateway mode) or
 * environment variables (stdio / env mode).
 */
export function getCredentials(): CheckpointCredentials | null {
  // Per-request credentials take priority (gateway HTTP mode)
  const reqCreds = getRequestCredentials();
  if (reqCreds) {
    return {
      clientId: reqCreds.clientId,
      clientSecret: reqCreds.clientSecret,
      region: reqCreds.region || process.env.CHECKPOINT_REGION,
    };
  }

  // Fall back to environment variables
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

function credentialsChanged(creds: CheckpointCredentials, state: DerivedTokenState): boolean {
  if (!state.lastCredentials) return true;
  return (
    creds.clientId !== state.lastCredentials.clientId ||
    creds.clientSecret !== state.lastCredentials.clientSecret
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

async function refreshToken(creds: CheckpointCredentials, state: DerivedTokenState): Promise<void> {
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

  // `state` was captured by the caller before this function's first await,
  // so this write always lands on the request that requested it — even if
  // another tenant's refreshToken() call resolves in between.
  state.token = token;
  const expiresIn = (data.expiresIn as number) || 1800;
  state.tokenExpiresAt = Date.now() + expiresIn * 1000;

  const region = creds.region || decodeJwtRegion(token);
  state.baseUrl = (region && REGIONAL_BASE_URLS[region]) || DEFAULT_BASE_URL;
  logger.debug("Auth token obtained", { region, baseUrl: state.baseUrl });
}

async function fetchScopesFromUrl(baseUrl: string, token: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}${SCOPES_PATH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-av-req-id": randomUUID(),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as ApiResponse<string>;
  return (body.responseData ?? []).filter(
    (s): s is string => typeof s === "string" && s.includes(":")
  );
}

async function refreshScopes(state: DerivedTokenState): Promise<void> {
  if (!state.token) return;

  // Try the detected region first
  let scopes = await fetchScopesFromUrl(state.baseUrl, state.token);

  // If no valid scopes, the JWT region claim may be wrong — try all other regions
  if (scopes.length === 0) {
    logger.warn("No scopes at detected region, probing all regions", { detected: state.baseUrl });
    for (const [region, url] of Object.entries(REGIONAL_BASE_URLS)) {
      if (url === state.baseUrl) continue;
      scopes = await fetchScopesFromUrl(url, state.token);
      if (scopes.length > 0) {
        logger.info("Found scopes at alternate region", { region, url, scopes });
        state.baseUrl = url;
        break;
      }
    }
  }

  state.scopes = scopes;
  logger.debug("Scopes fetched", { scopes: state.scopes, baseUrl: state.baseUrl });
}

async function ensureAuth(): Promise<DerivedTokenState> {
  const creds = getCredentials();
  if (!creds) throw new Error("No Checkpoint credentials configured");

  // Captured once, up front — every read/write below (including across
  // awaits in refreshToken/refreshScopes) goes through this same object
  // reference, which is exclusive to this request context.
  const state = getTokenState();

  if (credentialsChanged(creds, state)) {
    state.token = null;
    state.tokenExpiresAt = 0;
    state.scopes = [];
    state.lastCredentials = { clientId: creds.clientId, clientSecret: creds.clientSecret };
  }

  if (!state.token || Date.now() >= state.tokenExpiresAt - 60_000) {
    await refreshToken(creds, state);
    await refreshScopes(state);
  }

  return state;
}

/**
 * Make an authenticated request to the HEC Smart API.
 *
 * For multi-scope keys, scopes are injected into requestData automatically.
 * Single-scope keys work without specifying scopes (API auto-selects).
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<ApiResponse<T>> {
  const state = await ensureAuth();

  if (state.scopes.length === 0) {
    logger.warn(
      "No HEC scopes available for this key — key may lack farm association. " +
      "Call /v1.0/scopes to diagnose. Expected format: farm:customer (e.g. mt-prod-cp-eu-1:myorg)"
    );
  }

  const url = new URL(`${state.baseUrl}/app/hec-api${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${state.token!}`,
    "x-av-req-id": randomUUID(),
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const fetchOptions: RequestInit = { method, headers, signal: AbortSignal.timeout(30_000) };

  if (options.body !== undefined && method !== "GET") {
    let body = options.body as Record<string, unknown>;
    // For multi-scope keys, inject scopes into requestData so the API can route correctly.
    // Single-scope keys: API picks the only scope automatically when omitted.
    if (state.scopes.length > 1 && body.requestData && typeof body.requestData === "object") {
      body = {
        ...body,
        requestData: { scopes: state.scopes, ...(body.requestData as Record<string, unknown>) },
      };
    }
    fetchOptions.body = JSON.stringify(body);
  }

  logger.debug("HEC API request", { method, url: url.toString(), scopes: state.scopes });
  const res = await fetch(url.toString(), fetchOptions);

  const raw = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`HEC API returned non-JSON (${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      state.token = null;
      state.tokenExpiresAt = 0;
    }

    // Surface the full responseText for Checkpoint API errors (more informative than message)
    const apiBody = body as Record<string, unknown>;
    const envelope = apiBody?.responseEnvelope as Record<string, unknown> | undefined;
    const msg = envelope?.responseText
      ? String(envelope.responseText)
      : `HTTP ${res.status}`;

    logger.error("HEC API error", { status: res.status, url: url.toString(), msg });
    throw new Error(`HEC API error (${res.status}): ${msg}`);
  }

  return body as ApiResponse<T>;
}

export function clearCredentials(): void {
  // Only ever clears the single-tenant fallback (stdio/env mode). Gateway
  // requests own their DerivedTokenState for the life of the request only —
  // there is nothing module-level for a gateway request to clear.
  _fallbackTokenState = createDerivedTokenState();
}
