/**
 * Tests for navigation and domain state management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock handlers using vi.hoisted
const { mockHandlers } = vi.hoisted(() => {
  const mockHandlers = {
    quarantine: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_quarantine_list", description: "List quarantined emails" },
        { name: "avanan_quarantine_get", description: "Get quarantined email details" },
        { name: "avanan_quarantine_release", description: "Release a quarantined email" },
        { name: "avanan_quarantine_delete", description: "Delete a quarantined email" },
      ]),
      handleCall: vi.fn(),
    },
    threats: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_threats_list", description: "List threats" },
        { name: "avanan_threats_get", description: "Get threat details" },
        { name: "avanan_threats_iocs", description: "Get IOCs" },
        { name: "avanan_threats_timeline", description: "Get threat timeline" },
      ]),
      handleCall: vi.fn(),
    },
    events: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_events_list", description: "List events" },
        { name: "avanan_events_get", description: "Get event details" },
        { name: "avanan_alerts_list", description: "List alerts" },
      ]),
      handleCall: vi.fn(),
    },
    policies: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_policies_list", description: "List policies" },
      ]),
      handleCall: vi.fn(),
    },
    users: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_users_list", description: "List users" },
      ]),
      handleCall: vi.fn(),
    },
    reports: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_reports_threat_summary", description: "Threat summary" },
      ]),
      handleCall: vi.fn(),
    },
    incidents: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_incidents_list", description: "List incidents" },
      ]),
      handleCall: vi.fn(),
    },
    banners: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_banners_list", description: "List banners" },
      ]),
      handleCall: vi.fn(),
    },
    saas: {
      getTools: vi.fn().mockReturnValue([
        { name: "avanan_saas_list", description: "List SaaS apps" },
      ]),
      handleCall: vi.fn(),
    },
  };

  return { mockHandlers };
});

// Mock all domain handlers
vi.mock("../domains/quarantine.js", () => ({
  quarantineHandler: mockHandlers.quarantine,
}));
vi.mock("../domains/threats.js", () => ({
  threatsHandler: mockHandlers.threats,
}));
vi.mock("../domains/events.js", () => ({
  eventsHandler: mockHandlers.events,
}));
vi.mock("../domains/policies.js", () => ({
  policiesHandler: mockHandlers.policies,
}));
vi.mock("../domains/users.js", () => ({
  usersHandler: mockHandlers.users,
}));
vi.mock("../domains/reports.js", () => ({
  reportsHandler: mockHandlers.reports,
}));
vi.mock("../domains/incidents.js", () => ({
  incidentsHandler: mockHandlers.incidents,
}));
vi.mock("../domains/banners.js", () => ({
  bannersHandler: mockHandlers.banners,
}));
vi.mock("../domains/saas.js", () => ({
  saasHandler: mockHandlers.saas,
}));

import {
  getDomainHandler,
  getAvailableDomains,
  clearDomainCache,
} from "../domains/index.js";
import { isDomainName } from "../utils/types.js";

function setupMockReturnValues() {
  mockHandlers.quarantine.getTools.mockReturnValue([
    { name: "avanan_quarantine_list", description: "List quarantined emails" },
    { name: "avanan_quarantine_get", description: "Get quarantined email details" },
    { name: "avanan_quarantine_release", description: "Release a quarantined email" },
    { name: "avanan_quarantine_delete", description: "Delete a quarantined email" },
  ]);
  mockHandlers.threats.getTools.mockReturnValue([
    { name: "avanan_threats_list", description: "List threats" },
    { name: "avanan_threats_get", description: "Get threat details" },
    { name: "avanan_threats_iocs", description: "Get IOCs" },
    { name: "avanan_threats_timeline", description: "Get threat timeline" },
  ]);
  mockHandlers.events.getTools.mockReturnValue([
    { name: "avanan_events_list", description: "List events" },
    { name: "avanan_events_get", description: "Get event details" },
    { name: "avanan_alerts_list", description: "List alerts" },
  ]);
  mockHandlers.policies.getTools.mockReturnValue([
    { name: "avanan_policies_list", description: "List policies" },
  ]);
  mockHandlers.users.getTools.mockReturnValue([
    { name: "avanan_users_list", description: "List users" },
  ]);
  mockHandlers.reports.getTools.mockReturnValue([
    { name: "avanan_reports_threat_summary", description: "Threat summary" },
  ]);
  mockHandlers.incidents.getTools.mockReturnValue([
    { name: "avanan_incidents_list", description: "List incidents" },
  ]);
  mockHandlers.banners.getTools.mockReturnValue([
    { name: "avanan_banners_list", description: "List banners" },
  ]);
  mockHandlers.saas.getTools.mockReturnValue([
    { name: "avanan_saas_list", description: "List SaaS apps" },
  ]);
}

describe("Domain Navigation", () => {
  beforeEach(() => {
    clearDomainCache();
    vi.clearAllMocks();
    setupMockReturnValues();
  });

  describe("getAvailableDomains", () => {
    it("should return all available domains", () => {
      const domains = getAvailableDomains();
      expect(domains).toEqual([
        "quarantine",
        "threats",
        "events",
        "policies",
        "users",
        "reports",
        "incidents",
        "banners",
        "saas",
      ]);
    });

    it("should return a consistent list", () => {
      const domains1 = getAvailableDomains();
      const domains2 = getAvailableDomains();
      expect(domains1).toEqual(domains2);
    });
  });

  describe("isDomainName", () => {
    it("should return true for valid domain names", () => {
      expect(isDomainName("quarantine")).toBe(true);
      expect(isDomainName("threats")).toBe(true);
      expect(isDomainName("events")).toBe(true);
      expect(isDomainName("policies")).toBe(true);
      expect(isDomainName("users")).toBe(true);
      expect(isDomainName("reports")).toBe(true);
      expect(isDomainName("incidents")).toBe(true);
      expect(isDomainName("banners")).toBe(true);
      expect(isDomainName("saas")).toBe(true);
    });

    it("should return false for invalid domain names", () => {
      expect(isDomainName("invalid")).toBe(false);
      expect(isDomainName("")).toBe(false);
      expect(isDomainName("QUARANTINE")).toBe(false);
      expect(isDomainName("devices")).toBe(false);
    });
  });

  describe("getDomainHandler", () => {
    it("should load quarantine domain handler", async () => {
      const handler = await getDomainHandler("quarantine");
      expect(handler).toBeDefined();
      expect(handler.getTools).toBeDefined();
      expect(handler.handleCall).toBeDefined();
    });

    it("should load threats domain handler", async () => {
      const handler = await getDomainHandler("threats");
      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(4);
    });

    it("should load events domain handler", async () => {
      const handler = await getDomainHandler("events");
      expect(handler).toBeDefined();
      expect(handler.getTools()).toHaveLength(3);
    });

    it("should cache domain handlers", async () => {
      const handler1 = await getDomainHandler("quarantine");
      const handler2 = await getDomainHandler("quarantine");
      expect(handler1).toBe(handler2);
    });

    it("should throw for unknown domain", async () => {
      await expect(
        getDomainHandler("unknown" as "quarantine")
      ).rejects.toThrow("Unknown domain: unknown");
    });
  });

  describe("clearDomainCache", () => {
    it("should clear the cached handlers", async () => {
      await getDomainHandler("quarantine");
      clearDomainCache();
      const handler2 = await getDomainHandler("quarantine");
      expect(handler2).toBeDefined();
      expect(handler2.getTools).toBeDefined();
    });
  });
});

describe("Domain Tools Structure", () => {
  beforeEach(() => {
    clearDomainCache();
    vi.clearAllMocks();
    setupMockReturnValues();
  });

  it("quarantine domain should expose quarantine-specific tools", async () => {
    const handler = await getDomainHandler("quarantine");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("avanan_quarantine_list");
    expect(toolNames).toContain("avanan_quarantine_release");
    expect(toolNames).toContain("avanan_quarantine_delete");
  });

  it("threats domain should expose threat analysis tools", async () => {
    const handler = await getDomainHandler("threats");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("avanan_threats_list");
    expect(toolNames).toContain("avanan_threats_get");
    expect(toolNames).toContain("avanan_threats_iocs");
  });

  it("events domain should expose event and alert tools", async () => {
    const handler = await getDomainHandler("events");
    const tools = handler.getTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("avanan_events_list");
    expect(toolNames).toContain("avanan_alerts_list");
  });
});
