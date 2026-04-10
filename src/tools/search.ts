/**
 * Search tools — find email/SaaS entities with attribute-based filtering.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiRequest } from "../utils/client.js";
import type { HecEntity, ApiResponse } from "../utils/types.js";
import type { CallToolResult } from "../utils/types.js";

export const searchTools: Tool[] = [
  {
    name: "hec_search_emails",
    description:
      "Search email and SaaS entities in Checkpoint Harmony Email. Filter by sender, recipient, subject, SaaS platform, and date range. Use extended filters for precise attribute matching (contains, startsWith, isEmpty, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        saas: {
          type: "string",
          description: "SaaS platform to search (required). E.g. office365_emails, google_mail.",
        },
        startDate: {
          type: "string",
          description: "Start date for the search (ISO 8601, required).",
        },
        endDate: {
          type: "string",
          description: "End date for the search (ISO 8601).",
        },
        saasEntity: {
          type: "string",
          description: "SaaS entity type filter (optional).",
        },
        filters: {
          type: "array",
          description:
            "Attribute filters. Each filter has saasAttrName, saasAttrOp, and saasAttrValue.",
          items: {
            type: "object",
            properties: {
              saasAttrName: {
                type: "string",
                description:
                  "Attribute name (e.g. fromEmail, subject, recipients, isQuarantined, attachmentMd5)",
              },
              saasAttrOp: {
                type: "string",
                enum: [
                  "is",
                  "isNot",
                  "contains",
                  "notContains",
                  "startsWith",
                  "isEmpty",
                  "isNotEmpty",
                  "greaterThan",
                  "lessThan",
                ],
              },
              saasAttrValue: {
                description: "Value to match against",
              },
            },
            required: ["saasAttrName", "saasAttrOp"],
          },
        },
        scrollId: {
          type: "string",
          description: "Scroll ID for pagination",
        },
      },
      required: ["saas", "startDate"],
    },
  },
  {
    name: "hec_get_email",
    description: "Get full details for a specific email entity by its entity ID.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "The entity ID to retrieve" },
      },
      required: ["entityId"],
    },
  },
];

export async function handleSearchTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (name === "hec_search_emails") {
    const entityFilter: Record<string, unknown> = {
      saas: args.saas,
      startDate: args.startDate,
    };
    if (args.endDate) entityFilter.endDate = args.endDate;
    if (args.saasEntity) entityFilter.saasEntity = args.saasEntity;

    const requestData: Record<string, unknown> = { entityFilter };
    if (args.filters) requestData.entityExtendedFilter = args.filters;
    if (args.scrollId) requestData.scrollId = args.scrollId;

    const result = await apiRequest<HecEntity>("/v1.0/search/query", {
      method: "POST",
      body: { requestData },
    });

    return formatResult(result);
  }

  if (name === "hec_get_email") {
    const entityId = args.entityId as string;
    const result = await apiRequest<HecEntity>(
      `/v1.0/search/entity/${encodeURIComponent(entityId)}`
    );
    return formatResult(result);
  }

  throw new Error(`Unknown search tool: ${name}`);
}

function formatResult(result: ApiResponse<HecEntity>): CallToolResult {
  const count = result.responseEnvelope.recordsNumber ?? result.responseData.length;
  const scrollId = result.responseEnvelope.scrollId;

  const summary = result.responseData.map((e) => ({
    entityId: e.entityInfo.entityId,
    saas: e.entityInfo.saas,
    entityCreated: e.entityInfo.entityCreated,
    subject: e.entityPayload.subject,
    from: e.entityPayload.fromEmail,
    to: e.entityPayload.to,
    isQuarantined: e.entityPayload.isQuarantined,
    isRestored: e.entityPayload.isRestored,
    verdict: e.entitySecurityResult?.combinedVerdict,
    availableActions: e.entityAvailableActions?.map((a) => a.entityActionName) ?? [],
  }));

  const text = [
    `Found ${count} email${count !== 1 ? "s" : ""}.`,
    scrollId ? `Next page scroll ID: ${scrollId}` : null,
    "",
    JSON.stringify(summary, null, 2),
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { content: [{ type: "text", text }] };
}
