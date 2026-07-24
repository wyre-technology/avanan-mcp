/**
 * Tests for the Checkpoint HEC client, in particular the per-request
 * derived-token isolation added to close a cross-tenant credential leak
 * (see credential-store.ts's module doc comment for the full writeup).
 *
 * Before the fix, refreshToken()/refreshScopes() wrote the bearer token,
 * scopes, and resolved base URL to module-level `let`s, and apiRequest()
 * read them back from those same module-level variables after `await
 * ensureAuth()`. Under concurrent multi-tenant load, one tenant's request
 * could still be suspended inside that await (e.g. mid `refreshScopes()`)
 * when another tenant's request ran to completion and overwrote the
 * module-level state — so the first tenant's apiRequest() would then read
 * back the second tenant's live bearer token and base URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiRequest, getCredentials, clearCredentials } from "./client.js";
import { runWithRequestCredentials } from "./credential-store.js";
import { REGIONAL_BASE_URLS } from "./types.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Checkpoint client", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearCredentials();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    clearCredentials();
  });

  describe("getCredentials", () => {
    it("returns null when no credentials are configured", () => {
      delete process.env.CHECKPOINT_CLIENT_ID;
      delete process.env.CHECKPOINT_CLIENT_SECRET;
      expect(getCredentials()).toBeNull();
    });

    it("reads credentials from environment variables", () => {
      process.env.CHECKPOINT_CLIENT_ID = "env-client-id";
      process.env.CHECKPOINT_CLIENT_SECRET = "env-client-secret";
      process.env.CHECKPOINT_REGION = "eu";

      expect(getCredentials()).toEqual({
        clientId: "env-client-id",
        clientSecret: "env-client-secret",
        region: "eu",
      });
    });

    it("prefers per-request (gateway) credentials over environment variables", () => {
      process.env.CHECKPOINT_CLIENT_ID = "env-client-id";
      process.env.CHECKPOINT_CLIENT_SECRET = "env-client-secret";

      const result = runWithRequestCredentials(
        { clientId: "gw-client-id", clientSecret: "gw-client-secret", region: "us" },
        () => getCredentials()
      );

      expect(result).toEqual({
        clientId: "gw-client-id",
        clientSecret: "gw-client-secret",
        region: "us",
      });
    });
  });

  describe("cross-tenant isolation under concurrent load (regression)", () => {
    // Two tenants with distinct credentials/regions, so a leaked token,
    // scope list, or base URL is unambiguously attributable to the wrong
    // tenant if it appears in the other tenant's request.
    const credsA = { clientId: "tenant-a-id", clientSecret: "tenant-a-secret", region: "us" };
    const credsB = { clientId: "tenant-b-id", clientSecret: "tenant-b-secret", region: "eu" };

    it("does not let tenant B's fully-completed refresh clobber tenant A's in-flight request", async () => {
      // Deterministic interleave via a manually-resolved deferred — not a
      // setTimeout stagger. Tenant A's *scopes* fetch (the step between
      // "token written" and "apiRequest reads it back") is gated so we
      // control exactly when it's allowed to resume. While it's parked
      // there, tenant B's entire request — auth, scopes, and its real API
      // call — is run to completion and awaited in full. Only then do we
      // release tenant A. If any derived state (token/baseUrl/scopes) is
      // shared instead of per-request, tenant A's request will observe
      // tenant B's values at the point it finally resumes.
      let releaseTenantAScopes!: () => void;
      const tenantAScopesGate = new Promise<void>((resolve) => {
        releaseTenantAScopes = resolve;
      });

      const apiCalls: Array<{ tag: string; url: string; authorization: string }> = [];

      global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        const headers = (init?.headers ?? {}) as Record<string, string>;

        if (url.includes("/auth/external")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { clientId: string };
          return jsonResponse(200, {
            success: true,
            data: { token: `token-for-${body.clientId}`, expiresIn: 1800 },
          });
        }

        if (url.includes("/v1.0/scopes")) {
          const token = headers.Authorization?.replace("Bearer ", "") ?? "";
          if (token === `token-for-${credsA.clientId}`) {
            // Park tenant A's scopes fetch here until the test releases it.
            await tenantAScopesGate;
          }
          return jsonResponse(200, {
            responseEnvelope: { requestId: "req-1", responseCode: 200, responseText: "OK" },
            responseData: [`farm:${token}`],
          });
        }

        // The actual HEC API call — record exactly what credentials/baseUrl
        // this in-flight request used, tagged by which token it authenticated with.
        const authorization = headers.Authorization ?? "";
        apiCalls.push({
          tag: authorization.includes(credsA.clientId) ? "A" : "B",
          url,
          authorization,
        });
        return jsonResponse(200, {
          responseEnvelope: { requestId: "req-2", responseCode: 200, responseText: "OK" },
          responseData: [],
        });
      });

      // Kick off tenant A. It will resolve its own auth fetch (ungated),
      // write its own token, then block inside refreshScopes()'s fetch call
      // on tenantAScopesGate — i.e. it is suspended *after* writing its
      // token but *before* apiRequest() reads it back.
      const runA = runWithRequestCredentials(credsA, () => apiRequest("/search/query"));

      // Tenant B's entire request — auth, scopes, and its real API call —
      // is run to completion and awaited in full while tenant A sits
      // parked at the gate above.
      const resultB = await runWithRequestCredentials(credsB, () => apiRequest("/search/query"));

      // Only now release tenant A. Under the pre-fix, module-level-cache
      // implementation, the shared state has since been overwritten by
      // tenant B's completed run, so tenant A's apiRequest() would read
      // tenant B's token and base URL here.
      releaseTenantAScopes();
      const resultA = await runA;

      // Every assertion below runs unconditionally after both real awaits
      // above resolved — nothing is swallowed or gated behind a callback
      // that could silently never fire.
      expect(resultA).toBeDefined();
      expect(resultB).toBeDefined();
      expect(apiCalls).toHaveLength(2);

      const callForA = apiCalls.find((c) => c.tag === "A");
      const callForB = apiCalls.find((c) => c.tag === "B");
      expect(callForA).toBeDefined();
      expect(callForB).toBeDefined();

      // Value assertions, not identity checks: each tenant's actual HEC API
      // call must carry *its own* bearer token and *its own* region's base
      // URL — never the other tenant's, even though tenant B's refresh ran
      // to completion while tenant A's request was still in flight.
      expect(callForA!.authorization).toBe(`Bearer token-for-${credsA.clientId}`);
      expect(callForB!.authorization).toBe(`Bearer token-for-${credsB.clientId}`);

      expect(callForA!.url.startsWith(REGIONAL_BASE_URLS.us)).toBe(true);
      expect(callForB!.url.startsWith(REGIONAL_BASE_URLS.eu)).toBe(true);

      // Sanity: the two tenants' tokens/base URLs are genuinely different,
      // so the assertions above couldn't pass by coincidence.
      expect(callForA!.authorization).not.toBe(callForB!.authorization);
      expect(REGIONAL_BASE_URLS.us).not.toBe(REGIONAL_BASE_URLS.eu);
    });
  });
});
