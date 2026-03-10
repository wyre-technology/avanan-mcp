/**
 * Reports domain handler
 *
 * Provides tools for security reports and statistics:
 * - Get threat summary statistics
 * - Get email flow statistics
 * - Get protection effectiveness report
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitSelection } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_reports_threat_summary",
      description:
        "Get threat summary statistics for a given time period. Includes counts by threat type, severity, and action taken.",
      inputSchema: {
        type: "object" as const,
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month", "quarter"],
            description: "Time period for the report (default: week)",
          },
          date_from: {
            type: "string",
            description: "Custom start date (ISO 8601 format, overrides period)",
          },
          date_to: {
            type: "string",
            description: "Custom end date (ISO 8601 format, overrides period)",
          },
        },
      },
    },
    {
      name: "avanan_reports_email_stats",
      description:
        "Get email flow statistics including total emails processed, blocked, quarantined, and delivered.",
      inputSchema: {
        type: "object" as const,
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month", "quarter"],
            description: "Time period for the report (default: week)",
          },
          date_from: {
            type: "string",
            description: "Custom start date (ISO 8601 format, overrides period)",
          },
          date_to: {
            type: "string",
            description: "Custom end date (ISO 8601 format, overrides period)",
          },
        },
      },
    },
    {
      name: "avanan_reports_protection",
      description:
        "Get protection effectiveness report showing detection rates, false positive rates, and response times.",
      inputSchema: {
        type: "object" as const,
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month", "quarter"],
            description: "Time period for the report (default: month)",
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
    case "avanan_reports_threat_summary": {
      let period = args.period as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      if (!period && !dateFrom) {
        const selected = await elicitSelection(
          "What time period would you like the threat summary for?",
          "period",
          [
            { value: "today", label: "Today" },
            { value: "week", label: "Past Week" },
            { value: "month", label: "Past Month" },
            { value: "quarter", label: "Past Quarter" },
          ]
        );
        period = selected || "week";
      }

      logger.info("API call: reports.threatSummary", { period, dateFrom, dateTo });

      const params: Record<string, string | number | boolean | undefined> = {};
      if (dateFrom) {
        params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      } else {
        params.period = period || "week";
      }

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/reports/threats/summary", { params });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_reports_email_stats": {
      let period = args.period as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      if (!period && !dateFrom) {
        period = "week";
      }

      logger.info("API call: reports.emailStats", { period, dateFrom, dateTo });

      const params: Record<string, string | number | boolean | undefined> = {};
      if (dateFrom) {
        params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      } else {
        params.period = period || "week";
      }

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/reports/email/stats", { params });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_reports_protection": {
      const period = (args.period as string) || "month";

      logger.info("API call: reports.protection", { period });

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/reports/protection", {
        params: { period },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown reports tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const reportsHandler: DomainHandler = {
  getTools,
  handleCall,
};
