/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the security event card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildEventCard normalizes a HEC event into the card payload the
 *      iframe renders from, best-effort (read-only card — no write action)
 */

import { describe, it, expect, vi } from "vitest";
import { eventTools, handleEventTool } from "./tools/events.js";
import { searchTools } from "./tools/search.js";
import { actionTools } from "./tools/actions.js";
import { exceptionTools } from "./tools/exceptions.js";
import { listResources, readResource } from "./resources.js";
import {
  buildEventCard,
  applyBrandInjection,
  EVENT_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from "./card.builder.js";
import { EVENT_CARD_HTML } from "./generated/event-card-html.js";
import { apiRequest } from "./utils/client.js";
import type { ApiResponse, HecEvent } from "./utils/types.js";

vi.mock("./utils/client.js", () => ({
  apiRequest: vi.fn(),
}));

const RENDERABLE_TOOLS = ["hec_get_event"];

const ALL_TOOLS = [...eventTools, ...searchTools, ...actionTools, ...exceptionTools];

const sampleEvent: HecEvent = {
  eventId: "6889a1f0e4b0c3a1d2e3f4a5",
  customerId: "acme",
  saas: "office365_emails",
  entityId: "ent-1",
  state: "new",
  type: "phishing",
  confidenceIndicator: "detected",
  eventCreated: "2026-07-16T09:00:00Z",
  severity: "critical",
  description: "Phishing email detected: 'Invoice overdue' from spoofed sender",
  data: "{}",
  availableEventActions: [{ actionName: "quarantine", actionParameter: {} }],
  actions: [
    { actionType: "send_alert", createTime: "2026-07-16T09:01:00Z", relatedEntityId: "ent-1" },
  ],
};

function envelope(events: unknown[]): ApiResponse<HecEvent> {
  return {
    responseEnvelope: {
      requestId: "req-1",
      responseCode: 200,
      responseText: "OK",
      recordsNumber: events.length,
    },
    responseData: events as HecEvent[],
  };
}

/** Parse the JSON summary array out of a formatPagedResult text payload. */
function parseSummary(text: string): Array<Record<string, unknown>> {
  return JSON.parse(text.slice(text.indexOf("["))) as Array<Record<string, unknown>>;
}

describe("MCP Apps security event card", () => {
  describe("tool _meta advertisement", () => {
    it.each(RENDERABLE_TOOLS)("%s links the card via _meta", (name) => {
      const tool = ALL_TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.["ui/resourceUri"]).toBe(EVENT_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        EVENT_CARD_RESOURCE_URI
      );
    });

    it("no other tools carry UI metadata", () => {
      const others = ALL_TOOLS.filter((t) => t._meta && !RENDERABLE_TOOLS.includes(t.name));
      expect(others).toEqual([]);
    });
  });

  describe("ui:// resource", () => {
    it("is listed with the MCP Apps MIME type", () => {
      const card = listResources().find((r) => r.uri === EVENT_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it("reads back as profile=mcp-app HTML containing the card app", () => {
      const content = readResource(EVENT_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(EVENT_CARD_HTML);
      expect(content.text).toContain("card__bar");
      // The injection marker survives the vite build, exactly once.
      expect(content.text.split("BRAND_INJECT").length - 1).toBe(1);
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./event-card.ts"');
    });

    it("serves neutral defaults with no vendor identity or external fetches", () => {
      const { text } = readResource(EVENT_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain("00c9db"); // WYRE cyan
      expect(text).not.toContain("ede947"); // WYRE yellow
      expect(text).not.toContain("fonts.googleapis.com"); // no external fetches
    });

    it("injects MCP_BRAND_* env vars into the served HTML", () => {
      vi.stubEnv("MCP_BRAND_NAME", "Acme MSP");
      vi.stubEnv("MCP_BRAND_PRIMARY_COLOR", "#ff0000");
      try {
        const { text } = readResource(EVENT_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain("BRAND_INJECT");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects unknown resource URIs", () => {
      expect(() => readResource("ui://avanan/nope.html")).toThrow(/Unknown resource/);
    });
  });

  describe("applyBrandInjection", () => {
    const html = EVENT_CARD_HTML;

    it("replaces the marker with an inline window.__BRAND__ script", () => {
      const out = applyBrandInjection(html, { name: "Acme", primaryColor: "#123456" });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain("BRAND_INJECT");
    });

    it("escapes < so brand values cannot break out of the script tag", () => {
      const out = applyBrandInjection(html, { name: "</script><script>alert(1)" });
      expect(out).not.toContain("</script><script>alert(1)");
      expect(out).toContain("\\u003c/script>\\u003cscript>alert(1)");
    });

    it("returns the HTML unchanged for an empty brand", () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: "" })).toBe(html);
    });
  });

  describe("buildEventCard", () => {
    it("normalizes enum values into flat display labels", () => {
      expect(buildEventCard(sampleEvent)).toEqual({
        eventId: "6889a1f0e4b0c3a1d2e3f4a5",
        title: "Phishing",
        severity: "Critical",
        state: "New",
        confidence: "Detected",
        saas: "Office 365 Mail",
        detected: "2026-07-16T09:00:00Z",
        description: "Phishing email detected: 'Invoice overdue' from spoofed sender",
        actionsTaken: ["Send Alert"],
        availableActions: ["Quarantine"],
      });
    });

    it("humanizes values outside the known enums instead of dropping them", () => {
      const card = buildEventCard({
        ...sampleEvent,
        type: "malicious_url_click",
        saas: "some_future_saas",
      });
      expect(card?.title).toBe("Malicious URL Click");
      expect(card?.saas).toBe("Some Future Saas");
    });

    it("builds a minimal card when optional fields are missing", () => {
      const card = buildEventCard({ eventId: "e1", type: "dlp" } as Partial<HecEvent>);
      expect(card).toEqual({
        eventId: "e1",
        title: "DLP",
        actionsTaken: [],
        availableActions: [],
      });
    });

    it("truncates long descriptions so the card payload stays small", () => {
      const card = buildEventCard({ ...sampleEvent, description: "x".repeat(600) });
      expect(card?.description).toHaveLength(500);
    });

    it("returns null for payloads that are not an event", () => {
      expect(buildEventCard(undefined)).toBeNull();
      expect(buildEventCard({} as Partial<HecEvent>)).toBeNull();
      expect(buildEventCard({ eventId: "e1" } as Partial<HecEvent>)).toBeNull();
      expect(buildEventCard({ type: "phishing" } as Partial<HecEvent>)).toBeNull();
    });
  });

  describe("hec_get_event result", () => {
    const mockedApiRequest = vi.mocked(apiRequest);

    it("carries the _card object while the payload stays otherwise unchanged", async () => {
      mockedApiRequest.mockResolvedValueOnce(envelope([sampleEvent]));
      const result = await handleEventTool("hec_get_event", { eventId: sampleEvent.eventId });
      const text = result.content[0].text;
      expect(text).toContain("Found 1 event.");
      const summary = parseSummary(text);
      expect(summary[0]).toMatchObject({
        eventId: sampleEvent.eventId,
        type: "phishing",
        state: "new",
        severity: "critical",
        availableActions: ["quarantine"],
      });
      expect(summary[0]._card).toMatchObject({ title: "Phishing", severity: "Critical" });
    });

    it("degrades to a card-less result when the event cannot be normalized", async () => {
      mockedApiRequest.mockResolvedValueOnce(envelope([{ unexpected: "shape" }]));
      const result = await handleEventTool("hec_get_event", { eventId: "e1" });
      expect(result.isError).toBeUndefined();
      const summary = parseSummary(result.content[0].text);
      expect(summary[0]._card).toBeUndefined();
    });

    it("does not attach cards to hec_query_events results", async () => {
      mockedApiRequest.mockResolvedValueOnce(envelope([sampleEvent]));
      const result = await handleEventTool("hec_query_events", {});
      const summary = parseSummary(result.content[0].text);
      expect(summary[0]._card).toBeUndefined();
    });
  });
});
