/**
 * Tests for the threats domain handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
vi.mock("../../utils/client.js", () => ({
  apiRequest: vi.fn(),
  getCredentials: vi.fn().mockReturnValue({
    clientId: "test-id",
    clientSecret: "test-secret",
    baseUrl: "https://cloudinfra-gw.portal.checkpoint.com",
  }),
  clearCredentials: vi.fn(),
}));

import { threatsHandler } from "../../domains/threats.js";
import { apiRequest } from "../../utils/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("Threats Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTools", () => {
    it("should return threat tools", () => {
      const tools = threatsHandler.getTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("avanan_threats_list");
      expect(toolNames).toContain("avanan_threats_get");
      expect(toolNames).toContain("avanan_threats_iocs");
      expect(toolNames).toContain("avanan_threats_timeline");
    });

    it("should require threat_id for detail tools", () => {
      const tools = threatsHandler.getTools();
      const getTool = tools.find((t) => t.name === "avanan_threats_get");
      expect(getTool?.inputSchema.required).toContain("threat_id");

      const iocsTool = tools.find((t) => t.name === "avanan_threats_iocs");
      expect(iocsTool?.inputSchema.required).toContain("threat_id");
    });
  });

  describe("handleCall - avanan_threats_list", () => {
    it("should list threats with defaults", async () => {
      const fakeThreats = [
        { id: "threat-1", type: "phishing", severity: "high" },
        { id: "threat-2", type: "malware", severity: "critical" },
      ];
      mockApiRequest.mockResolvedValueOnce(fakeThreats);

      const result = await threatsHandler.handleCall("avanan_threats_list", {});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.threats).toEqual(fakeThreats);
    });

    it("should pass filter params", async () => {
      mockApiRequest.mockResolvedValueOnce([]);

      await threatsHandler.handleCall("avanan_threats_list", {
        severity: "critical",
        threat_type: "phishing",
      });

      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/threats",
        expect.objectContaining({
          params: expect.objectContaining({
            severity: "critical",
            threat_type: "phishing",
          }),
        })
      );
    });
  });

  describe("handleCall - avanan_threats_get", () => {
    it("should get threat details", async () => {
      const fakeThreat = { id: "threat-1", type: "phishing", details: {} };
      mockApiRequest.mockResolvedValueOnce(fakeThreat);

      const result = await threatsHandler.handleCall("avanan_threats_get", {
        threat_id: "threat-1",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/threats/threat-1"
      );
    });

    it("should return error when threat_id is missing", async () => {
      const result = await threatsHandler.handleCall("avanan_threats_get", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("threat_id is required");
    });
  });

  describe("handleCall - avanan_threats_iocs", () => {
    it("should get IOCs for a threat", async () => {
      const fakeIOCs = { urls: ["http://evil.com"], hashes: ["abc123"] };
      mockApiRequest.mockResolvedValueOnce(fakeIOCs);

      const result = await threatsHandler.handleCall("avanan_threats_iocs", {
        threat_id: "threat-1",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/threats/threat-1/iocs"
      );
    });
  });

  describe("handleCall - avanan_threats_timeline", () => {
    it("should get threat timeline", async () => {
      const fakeTimeline = [{ timestamp: "2026-03-01", action: "detected" }];
      mockApiRequest.mockResolvedValueOnce(fakeTimeline);

      const result = await threatsHandler.handleCall("avanan_threats_timeline", {
        threat_id: "threat-1",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/threats/threat-1/timeline"
      );
    });
  });

  describe("handleCall - unknown tool", () => {
    it("should return error for unknown tool name", async () => {
      const result = await threatsHandler.handleCall("avanan_unknown", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown threats tool");
    });
  });
});
