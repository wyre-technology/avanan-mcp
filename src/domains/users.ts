/**
 * Users domain handler
 *
 * Provides tools for user and entity management:
 * - List users/entities
 * - Get user details
 * - Get user threat history
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitText } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_users_list",
      description:
        "List users and entities protected by Harmony Email. Returns user email, status, and protection details.",
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
          query: {
            type: "string",
            description: "Search by user name or email address",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "all"],
            description: "Filter by user status (default: all)",
          },
        },
      },
    },
    {
      name: "avanan_users_get",
      description:
        "Get detailed information about a specific user, including protection status and configuration.",
      inputSchema: {
        type: "object" as const,
        properties: {
          user_id: {
            type: "string",
            description: "The user ID",
          },
        },
        required: ["user_id"],
      },
    },
    {
      name: "avanan_users_threat_history",
      description:
        "Get the threat history for a specific user, showing all threats that targeted this user.",
      inputSchema: {
        type: "object" as const,
        properties: {
          user_id: {
            type: "string",
            description: "The user ID",
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
        required: ["user_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_users_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      let query = args.query as string | undefined;
      const status = args.status as string | undefined;

      // If no search term, ask the user
      if (!query) {
        const searchTerm = await elicitText(
          "No search criteria specified. Enter a user name or email to search for:",
          "query",
          "User name, email, or keyword"
        );
        if (searchTerm) {
          query = searchTerm;
        }
      }

      logger.info("API call: users.list", { page, limit, query, status });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (query) params.query = query;
      if (status && status !== "all") params.status = status;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/users", { params });

      const users = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ users, page, limit }, null, 2),
          },
        ],
      };
    }

    case "avanan_users_get": {
      const userId = args.user_id as string;
      if (!userId) {
        return {
          content: [{ type: "text", text: "Error: user_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: users.get", { userId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/users/${encodeURIComponent(userId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_users_threat_history": {
      const userId = args.user_id as string;
      if (!userId) {
        return {
          content: [{ type: "text", text: "Error: user_id is required" }],
          isError: true,
        };
      }

      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      logger.info("API call: users.threatHistory", { userId, dateFrom, dateTo });

      const params: Record<string, string | number | boolean | undefined> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/users/${encodeURIComponent(userId)}/threats`,
        { params }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown users tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const usersHandler: DomainHandler = {
  getTools,
  handleCall,
};
