/**
 * SaaS domain handler
 *
 * Provides tools for SaaS application protection status:
 * - List protected SaaS applications
 * - Get SaaS application details and protection status
 * - Get SaaS application security summary
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_saas_list",
      description:
        "List SaaS applications protected by Harmony Email & Collaboration. Shows protection status for M365, Google Workspace, Slack, etc.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["connected", "disconnected", "error", "all"],
            description: "Filter by connection status (default: all)",
          },
        },
      },
    },
    {
      name: "avanan_saas_get",
      description:
        "Get detailed protection status for a specific SaaS application, including connection health, scan coverage, and configuration.",
      inputSchema: {
        type: "object" as const,
        properties: {
          app_id: {
            type: "string",
            description: "The SaaS application ID",
          },
        },
        required: ["app_id"],
      },
    },
    {
      name: "avanan_saas_security_summary",
      description:
        "Get a security summary for a specific SaaS application, including threat counts, policy violations, and compliance status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          app_id: {
            type: "string",
            description: "The SaaS application ID",
          },
          period: {
            type: "string",
            enum: ["today", "week", "month", "quarter"],
            description: "Time period for the summary (default: week)",
          },
        },
        required: ["app_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_saas_list": {
      const status = args.status as string | undefined;

      logger.info("API call: saas.list", { status });

      const params: Record<string, string | number | boolean | undefined> = {};
      if (status && status !== "all") params.status = status;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/saas/applications", { params });

      const applications = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ applications }, null, 2),
          },
        ],
      };
    }

    case "avanan_saas_get": {
      const appId = args.app_id as string;
      if (!appId) {
        return {
          content: [{ type: "text", text: "Error: app_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: saas.get", { appId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/saas/applications/${encodeURIComponent(appId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_saas_security_summary": {
      const appId = args.app_id as string;
      if (!appId) {
        return {
          content: [{ type: "text", text: "Error: app_id is required" }],
          isError: true,
        };
      }

      const period = (args.period as string) || "week";

      logger.info("API call: saas.securitySummary", { appId, period });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/saas/applications/${encodeURIComponent(appId)}/security`,
        { params: { period } }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown SaaS tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const saasHandler: DomainHandler = {
  getTools,
  handleCall,
};
