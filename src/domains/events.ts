/**
 * Events domain handler
 *
 * Provides tools for email security events and alerts:
 * - List security events
 * - Get event details
 * - List active alerts
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitSelection } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_events_list",
      description:
        "List email security events. Returns events such as blocked emails, policy violations, and threat detections.",
      inputSchema: {
        type: "object" as const,
        properties: {
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          limit: {
            type: "number",
            description: "Number of results per page (default: 50)",
          },
          event_type: {
            type: "string",
            description: "Filter by event type (e.g., blocked, quarantined, delivered, policy_violation)",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "info"],
            description: "Filter by event severity",
          },
          date_from: {
            type: "string",
            description: "Start date filter (ISO 8601 format)",
          },
          date_to: {
            type: "string",
            description: "End date filter (ISO 8601 format)",
          },
        },
      },
    },
    {
      name: "avanan_events_get",
      description:
        "Get detailed information about a specific security event by ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          event_id: {
            type: "string",
            description: "The event ID",
          },
        },
        required: ["event_id"],
      },
    },
    {
      name: "avanan_alerts_list",
      description:
        "List active security alerts requiring attention.",
      inputSchema: {
        type: "object" as const,
        properties: {
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          limit: {
            type: "number",
            description: "Number of results per page (default: 50)",
          },
          status: {
            type: "string",
            enum: ["open", "acknowledged", "resolved"],
            description: "Filter by alert status",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "Filter by alert severity",
          },
        },
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_events_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      const eventType = args.event_type as string | undefined;
      const severity = args.severity as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      // If no filters, suggest a date range
      if (!eventType && !severity && !dateFrom) {
        const range = await elicitSelection(
          "No filters specified. What time range would you like to view events for?",
          "dateRange",
          [
            { value: "today", label: "Today" },
            { value: "past_week", label: "Past Week" },
            { value: "past_month", label: "Past Month" },
            { value: "all", label: "All Time" },
          ]
        );

        if (range && range !== "all") {
          const now = new Date();
          if (range === "today") args = { ...args, date_from: now.toISOString().split("T")[0] };
          else if (range === "past_week") {
            now.setDate(now.getDate() - 7);
            args = { ...args, date_from: now.toISOString().split("T")[0] };
          } else if (range === "past_month") {
            now.setMonth(now.getMonth() - 1);
            args = { ...args, date_from: now.toISOString().split("T")[0] };
          }
        }
      }

      logger.info("API call: events.list", { page, limit, eventType, severity });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (eventType) params.event_type = eventType;
      if (severity) params.severity = severity;
      if (args.date_from) params.date_from = args.date_from as string;
      if (dateTo) params.date_to = dateTo;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/events", { params });

      const events = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ events, page, limit }, null, 2),
          },
        ],
      };
    }

    case "avanan_events_get": {
      const eventId = args.event_id as string;
      if (!eventId) {
        return {
          content: [{ type: "text", text: "Error: event_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: events.get", { eventId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/events/${encodeURIComponent(eventId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_alerts_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      const status = args.status as string | undefined;
      const severity = args.severity as string | undefined;

      logger.info("API call: alerts.list", { page, limit, status, severity });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (status) params.status = status;
      if (severity) params.severity = severity;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/alerts", { params });

      const alerts = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ alerts, page, limit }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown events tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const eventsHandler: DomainHandler = {
  getTools,
  handleCall,
};
