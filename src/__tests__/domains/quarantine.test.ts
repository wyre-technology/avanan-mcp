/**
 * Tests for the quarantine domain handler
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

import { quarantineHandler } from "../../domains/quarantine.js";
import { apiRequest } from "../../utils/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("Quarantine Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTools", () => {
    it("should return quarantine tools", () => {
      const tools = quarantineHandler.getTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("avanan_quarantine_list");
      expect(toolNames).toContain("avanan_quarantine_get");
      expect(toolNames).toContain("avanan_quarantine_release");
      expect(toolNames).toContain("avanan_quarantine_delete");
    });

    it("should have proper input schemas", () => {
      const tools = quarantineHandler.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("release should require entity_id", () => {
      const tools = quarantineHandler.getTools();
      const releaseTool = tools.find((t) => t.name === "avanan_quarantine_release");
      expect(releaseTool?.inputSchema.required).toContain("entity_id");
    });

    it("delete should require entity_id", () => {
      const tools = quarantineHandler.getTools();
      const deleteTool = tools.find((t) => t.name === "avanan_quarantine_delete");
      expect(deleteTool?.inputSchema.required).toContain("entity_id");
    });
  });

  describe("handleCall - avanan_quarantine_list", () => {
    it("should list quarantined emails with defaults", async () => {
      const fakeEmails = [
        { id: "email-1", sender: "spam@evil.com", recipient: "user@org.com", subject: "Win money!" },
        { id: "email-2", sender: "phish@bad.com", recipient: "admin@org.com", subject: "Urgent!" },
      ];
      mockApiRequest.mockResolvedValueOnce(fakeEmails);

      const result = await quarantineHandler.handleCall("avanan_quarantine_list", {});

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/quarantine/emails",
        expect.objectContaining({ params: expect.objectContaining({ page: 1, limit: 50 }) })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.emails).toEqual(fakeEmails);
    });

    it("should pass filter params to the API", async () => {
      mockApiRequest.mockResolvedValueOnce([]);

      await quarantineHandler.handleCall("avanan_quarantine_list", {
        sender: "spam@evil.com",
        recipient: "user@org.com",
        page: 2,
        limit: 25,
      });

      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/quarantine/emails",
        expect.objectContaining({
          params: expect.objectContaining({
            page: 2,
            limit: 25,
            sender: "spam@evil.com",
            recipient: "user@org.com",
          }),
        })
      );
    });

    it("should handle wrapped response objects", async () => {
      mockApiRequest.mockResolvedValueOnce({
        data: [{ id: "email-1" }],
        total: 1,
      });

      const result = await quarantineHandler.handleCall("avanan_quarantine_list", {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.emails).toEqual([{ id: "email-1" }]);
    });
  });

  describe("handleCall - avanan_quarantine_get", () => {
    it("should get quarantined email details", async () => {
      const fakeEmail = { id: "email-1", sender: "spam@evil.com", subject: "Win!" };
      mockApiRequest.mockResolvedValueOnce(fakeEmail);

      const result = await quarantineHandler.handleCall("avanan_quarantine_get", {
        entity_id: "email-1",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/quarantine/emails/email-1"
      );
    });

    it("should return error when entity_id is missing", async () => {
      const result = await quarantineHandler.handleCall("avanan_quarantine_get", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("entity_id is required");
    });
  });

  describe("handleCall - avanan_quarantine_release", () => {
    it("should release a quarantined email by ID", async () => {
      mockApiRequest.mockResolvedValueOnce({ status: "released" });

      const result = await quarantineHandler.handleCall("avanan_quarantine_release", {
        entity_id: "abc-123",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/quarantine/emails/abc-123/release",
        expect.objectContaining({ method: "POST" })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should return error when entity_id is missing", async () => {
      const result = await quarantineHandler.handleCall("avanan_quarantine_release", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("entity_id is required");
    });
  });

  describe("handleCall - avanan_quarantine_delete", () => {
    it("should delete a quarantined email by ID", async () => {
      mockApiRequest.mockResolvedValueOnce({ status: "deleted" });

      const result = await quarantineHandler.handleCall("avanan_quarantine_delete", {
        entity_id: "abc-456",
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/app/hec-api/v1.0/quarantine/emails/abc-456",
        expect.objectContaining({ method: "DELETE" })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("should return error when entity_id is missing", async () => {
      const result = await quarantineHandler.handleCall("avanan_quarantine_delete", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("entity_id is required");
    });
  });

  describe("handleCall - unknown tool", () => {
    it("should return error for unknown tool name", async () => {
      const result = await quarantineHandler.handleCall("avanan_unknown", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown quarantine tool");
    });
  });
});
