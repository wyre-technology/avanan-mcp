/**
 * Tests for the API client utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCredentials, clearCredentials } from "../utils/client.js";

describe("Client Utility", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearCredentials();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getCredentials", () => {
    it("should return null when no credentials are set", () => {
      delete process.env.CHECKPOINT_CLIENT_ID;
      delete process.env.CHECKPOINT_CLIENT_SECRET;

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return null when only client ID is set", () => {
      process.env.CHECKPOINT_CLIENT_ID = "test-id";
      delete process.env.CHECKPOINT_CLIENT_SECRET;

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return null when only client secret is set", () => {
      delete process.env.CHECKPOINT_CLIENT_ID;
      process.env.CHECKPOINT_CLIENT_SECRET = "test-secret";

      const creds = getCredentials();
      expect(creds).toBeNull();
    });

    it("should return credentials when both are set", () => {
      process.env.CHECKPOINT_CLIENT_ID = "test-id";
      process.env.CHECKPOINT_CLIENT_SECRET = "test-secret";

      const creds = getCredentials();
      expect(creds).not.toBeNull();
      expect(creds!.clientId).toBe("test-id");
      expect(creds!.clientSecret).toBe("test-secret");
    });

    it("should use default base URL when not set", () => {
      process.env.CHECKPOINT_CLIENT_ID = "test-id";
      process.env.CHECKPOINT_CLIENT_SECRET = "test-secret";
      delete process.env.CHECKPOINT_BASE_URL;

      const creds = getCredentials();
      expect(creds!.baseUrl).toBe("https://cloudinfra-gw.portal.checkpoint.com");
    });

    it("should use custom base URL when set", () => {
      process.env.CHECKPOINT_CLIENT_ID = "test-id";
      process.env.CHECKPOINT_CLIENT_SECRET = "test-secret";
      process.env.CHECKPOINT_BASE_URL = "https://custom.checkpoint.com";

      const creds = getCredentials();
      expect(creds!.baseUrl).toBe("https://custom.checkpoint.com");
    });
  });
});
