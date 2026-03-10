/**
 * Banners domain handler
 *
 * Provides tools for Smart Banners management:
 * - List Smart Banner configurations
 * - Get banner details
 * - Update banner settings
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitConfirmation } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_banners_list",
      description:
        "List Smart Banner configurations. Smart Banners add contextual warnings to emails to alert users of potential threats.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["enabled", "disabled", "all"],
            description: "Filter by banner status (default: all)",
          },
        },
      },
    },
    {
      name: "avanan_banners_get",
      description:
        "Get detailed information about a specific Smart Banner configuration.",
      inputSchema: {
        type: "object" as const,
        properties: {
          banner_id: {
            type: "string",
            description: "The banner configuration ID",
          },
        },
        required: ["banner_id"],
      },
    },
    {
      name: "avanan_banners_update",
      description:
        "Update a Smart Banner configuration, including enabling/disabling and modifying display rules.",
      inputSchema: {
        type: "object" as const,
        properties: {
          banner_id: {
            type: "string",
            description: "The banner configuration ID to update",
          },
          enabled: {
            type: "boolean",
            description: "Whether the banner should be enabled",
          },
          message: {
            type: "string",
            description: "The banner message text to display",
          },
        },
        required: ["banner_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_banners_list": {
      const status = args.status as string | undefined;

      logger.info("API call: banners.list", { status });

      const params: Record<string, string | number | boolean | undefined> = {};
      if (status && status !== "all") params.status = status;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/smart-banners", { params });

      const banners = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ banners }, null, 2),
          },
        ],
      };
    }

    case "avanan_banners_get": {
      const bannerId = args.banner_id as string;
      if (!bannerId) {
        return {
          content: [{ type: "text", text: "Error: banner_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: banners.get", { bannerId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/smart-banners/${encodeURIComponent(bannerId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_banners_update": {
      const bannerId = args.banner_id as string;
      if (!bannerId) {
        return {
          content: [{ type: "text", text: "Error: banner_id is required" }],
          isError: true,
        };
      }

      const confirmed = await elicitConfirmation(
        `Are you sure you want to update Smart Banner ${bannerId}? This will affect how email warnings appear to end users.`
      );
      if (confirmed === false) {
        return {
          content: [{ type: "text", text: "Banner update cancelled by user." }],
        };
      }

      logger.info("API call: banners.update", { bannerId });

      const body: Record<string, unknown> = {};
      if (typeof args.enabled === "boolean") body.enabled = args.enabled;
      if (args.message) body.message = args.message;

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/smart-banners/${encodeURIComponent(bannerId)}`,
        { method: "PUT", body }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Banner ${bannerId} updated successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown banners tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const bannersHandler: DomainHandler = {
  getTools,
  handleCall,
};
