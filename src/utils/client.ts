/**
 * Checkpoint Harmony Email & Collaboration (Avanan) HTTP client and credential management.
 *
 * Authentication uses OAuth2 client credentials flow.
 * In gateway mode (AUTH_MODE=gateway), credentials are injected
 * into process.env by the HTTP transport layer from request headers.
 *
 * In env mode (AUTH_MODE=env or unset), credentials come from
 * CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET environment variables directly.
 */

import { logger } from "./logger.js";
import type { CheckpointCredentials } from "./types.js";

const CHECKPOINT_BASE_URL = "https://cloudinfra-gw.portal.checkpoint.com";
const TOKEN_ENDPOINT = "/auth/external";

let _accessToken: string | null = null;
let _tokenExpiresAt: number = 0;
let _credentials: CheckpointCredentials | null = null;

/**
 * Get credentials from environment variables
 */
export function getCredentials(): CheckpointCredentials | null {
  const clientId = process.env.CHECKPOINT_CLIENT_ID;
  const clientSecret = process.env.CHECKPOINT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn("Missing credentials", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  return {
    clientId,
    clientSecret,
    baseUrl: process.env.CHECKPOINT_BASE_URL || CHECKPOINT_BASE_URL,
  };
}

/**
 * Obtain an access token using client credentials.
 * Caches the token until it expires.
 */
async function getAccessToken(creds: CheckpointCredentials): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_accessToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _accessToken;
  }

  logger.debug("Requesting new access token");

  const response = await fetch(`${creds.baseUrl}${TOKEN_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      clientId: creds.clientId,
      accessKey: creds.clientSecret,
    }),
  });

  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText;
  }

  if (!response.ok) {
    const message =
      typeof responseBody === "object" &&
      responseBody !== null &&
      "message" in responseBody
        ? String((responseBody as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    logger.error("Token request failed", { status: response.status, message });
    throw new Error(`Authentication failed: ${message}. Check your CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET.`);
  }

  const tokenData = responseBody as Record<string, unknown>;
  const token = tokenData.data as Record<string, unknown>;

  if (!token || !token.token) {
    throw new Error("Authentication response missing token field");
  }

  _accessToken = token.token as string;
  // Default expiry of 30 minutes if not provided
  const expiresIn = (token.expiresIn as number) || 1800;
  _tokenExpiresAt = Date.now() + expiresIn * 1000;

  logger.debug("Access token obtained", { expiresIn });
  return _accessToken;
}

/**
 * Make an authenticated HTTP request to the Checkpoint Harmony API.
 * Handles token acquisition and refresh automatically.
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error(
      "No Checkpoint API credentials configured. Please set CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET environment variables."
    );
  }

  // Invalidate token cache if credentials changed
  if (_credentials &&
      (creds.clientId !== _credentials.clientId || creds.clientSecret !== _credentials.clientSecret)) {
    _accessToken = null;
    _tokenExpiresAt = 0;
  }
  _credentials = creds;

  const accessToken = await getAccessToken(creds);

  const url = new URL(path, creds.baseUrl);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-mgmt-api-token": accessToken,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug("Checkpoint API request", { method, url: url.toString() });

  const response = await fetch(url.toString(), fetchOptions);

  // Safe: read text once, then try JSON parse
  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText;
  }

  if (!response.ok) {
    const message =
      typeof responseBody === "object" &&
      responseBody !== null &&
      "message" in responseBody
        ? String((responseBody as Record<string, unknown>).message)
        : `HTTP ${response.status}: ${response.statusText}`;

    logger.error("Checkpoint API error", {
      status: response.status,
      url: url.toString(),
      message,
    });

    if (response.status === 401) {
      // Token may have expired, clear cache and retry once
      _accessToken = null;
      _tokenExpiresAt = 0;
      throw new Error(`Authentication failed: ${message}. Check your credentials.`);
    }
    if (response.status === 403) {
      throw new Error(`Forbidden: ${message}. Insufficient permissions.`);
    }
    if (response.status === 404) {
      throw new Error(`Not found: ${message}`);
    }
    if (response.status === 429) {
      throw new Error(`Rate limit exceeded: ${message}. Please retry after a moment.`);
    }
    throw new Error(`Checkpoint API error (${response.status}): ${message}`);
  }

  return responseBody as T;
}

/**
 * Clear cached credentials and tokens (useful for testing)
 */
export function clearCredentials(): void {
  _credentials = null;
  _accessToken = null;
  _tokenExpiresAt = 0;
}
