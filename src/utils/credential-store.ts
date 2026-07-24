/**
 * Per-request credential isolation using AsyncLocalStorage.
 *
 * In gateway (HTTP) mode, each inbound request carries its own credentials
 * in headers. Instead of mutating process.env (which is shared across all
 * concurrent requests), we store credentials in AsyncLocalStorage so each
 * request handler sees only its own values.
 *
 * This context also carries the *derived* per-tenant OAuth state (bearer
 * token, scopes, resolved base URL) produced by client.ts's refreshToken()/
 * refreshScopes(). That derived state used to live in module-level `let`s,
 * which meant one tenant's in-flight token refresh could be overwritten by
 * another tenant's concurrent refresh before the first tenant read it back
 * (a cross-tenant credential leak under concurrent load). Scoping it inside
 * the same AsyncLocalStorage context as the raw credentials means each
 * gateway request gets its own isolated token cache, with no shared mutable
 * state anywhere in the request path.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_BASE_URL } from "./types.js";

export interface RequestCredentials {
  clientId: string;
  clientSecret: string;
  region?: string;
}

/**
 * Derived, per-request OAuth state. Unlike RequestCredentials (set once,
 * read-only for the life of the request), this is mutated in place as
 * refreshToken()/refreshScopes() resolve — but because every request gets
 * its own instance via runWithRequestCredentials(), mutating it in place is
 * safe: there is nothing else that could ever hold a reference to it.
 */
export interface DerivedTokenState {
  token: string | null;
  tokenExpiresAt: number;
  scopes: string[];
  baseUrl: string;
  /** clientId/clientSecret this state was derived from, for cache invalidation. */
  lastCredentials: { clientId: string; clientSecret: string } | null;
}

export function createDerivedTokenState(): DerivedTokenState {
  return {
    token: null,
    tokenExpiresAt: 0,
    scopes: [],
    baseUrl: DEFAULT_BASE_URL,
    lastCredentials: null,
  };
}

interface RequestContext {
  credentials: RequestCredentials;
  tokenState: DerivedTokenState;
}

const credentialStore = new AsyncLocalStorage<RequestContext>();

/**
 * Get credentials from the current request context (AsyncLocalStorage).
 * Returns undefined when called outside an active store.run() scope.
 */
export function getRequestCredentials(): RequestCredentials | undefined {
  return credentialStore.getStore()?.credentials;
}

/**
 * Get the derived-token cache for the current request context.
 * Returns undefined outside an active store.run() scope (stdio/env mode),
 * where client.ts falls back to a single-tenant module-level cache instead.
 */
export function getRequestTokenState(): DerivedTokenState | undefined {
  return credentialStore.getStore()?.tokenState;
}

/**
 * Run `fn` inside a fresh, isolated request context: its own credentials
 * and its own derived-token cache, neither of which can be observed or
 * mutated by any concurrently-running request. Used by gateway (HTTP
 * multi-tenant) mode.
 */
export function runWithRequestCredentials<T>(creds: RequestCredentials, fn: () => T): T {
  return credentialStore.run({ credentials: creds, tokenState: createDerivedTokenState() }, fn);
}
