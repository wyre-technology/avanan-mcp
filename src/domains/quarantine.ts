/**
 * Quarantine domain handler
 *
 * Provides tools for managing email quarantine:
 * - List quarantined emails
 * - Get quarantined email details
 * - Release a quarantined email
 * - Delete a quarantined email
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitText, elicitConfirmation } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_quarantine_list",
      description:
        "List quarantined emails. Returns emails held in quarantine with sender, recipient, subject, and quarantine reason.",
      inputSchema: {
        type: "object" as const,
        properties: {
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          limit: {
            type: "number",
            description: "Number of results per page (default: 50, max: 200)",
          },
          sender: {
            type: "string",
            description: "Filter by sender email address",
          },
          recipient: {
            type: "string",
            description: "Filter by recipient email address",
          },
          subject: {
            type: "string",
            description: "Filter by subject (partial match)",
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
      name: "avanan_quarantine_get",
      description:
        "Get detailed information about a specific quarantined email by ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          entity_id: {
            type: "string",
            description: "The quarantined email entity ID",
          },
        },
        required: ["entity_id"],
      },
    },
    {
      name: "avanan_quarantine_release",
      description:
        "Release a quarantined email by ID, delivering it to the intended recipient.",
      inputSchema: {
        type: "object" as const,
        properties: {
          entity_id: {
            type: "string",
            description: "The quarantined email entity ID to release",
          },
        },
        required: ["entity_id"],
      },
    },
    {
      name: "avanan_quarantine_delete",
      description:
        "Permanently delete a quarantined email by ID. This action cannot be undone.",
      inputSchema: {
        type: "object" as const,
        properties: {
          entity_id: {
            type: "string",
            description: "The quarantined email entity ID to delete",
          },
        },
        required: ["entity_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_quarantine_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      let sender = args.sender as string | undefined;
      let recipient = args.recipient as string | undefined;
      const subject = args.subject as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      // If no filters provided, ask the user if they want to narrow results
      if (!sender && !recipient && !subject && !dateFrom) {
        const recipientFilter = await elicitText(
          "The quarantine queue can be large. Would you like to filter by recipient email address? Leave blank to list all.",
          "recipient",
          "Enter a recipient email address to filter by, or leave blank for all"
        );
        if (recipientFilter) {
          recipient = recipientFilter;
        }
      }

      logger.info("API call: quarantine.list", {
        page,
        limit,
        sender,
        recipient,
      });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (sender) params.sender = sender;
      if (recipient) params.recipient = recipient;
      if (subject) params.subject = subject;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/quarantine/emails", { params });

      const emails = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      logger.debug("API response: quarantine.list", {
        count: Array.isArray(emails) ? emails.length : "unknown",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ emails, page, limit }, null, 2),
          },
        ],
      };
    }

    case "avanan_quarantine_get": {
      const entityId = args.entity_id as string;
      if (!entityId) {
        return {
          content: [{ type: "text", text: "Error: entity_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: quarantine.get", { entityId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/quarantine/emails/${encodeURIComponent(entityId)}`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "avanan_quarantine_release": {
      const entityId = args.entity_id as string;
      if (!entityId) {
        return {
          content: [{ type: "text", text: "Error: entity_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: quarantine.release", { entityId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/quarantine/emails/${encodeURIComponent(entityId)}/release`,
        { method: "POST" }
      );

      logger.debug("API response: quarantine.release", { result });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Email ${entityId} released successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    case "avanan_quarantine_delete": {
      const entityId = args.entity_id as string;
      if (!entityId) {
        return {
          content: [{ type: "text", text: "Error: entity_id is required" }],
          isError: true,
        };
      }

      // Confirm destructive action
      const confirmed = await elicitConfirmation(
        `Are you sure you want to permanently delete quarantined email ${entityId}? This action cannot be undone.`
      );
      if (confirmed === false) {
        return {
          content: [{ type: "text", text: "Delete operation cancelled by user." }],
        };
      }

      logger.info("API call: quarantine.delete", { entityId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/quarantine/emails/${encodeURIComponent(entityId)}`,
        { method: "DELETE" }
      );

      logger.debug("API response: quarantine.delete", { result });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Email ${entityId} deleted successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown quarantine tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const quarantineHandler: DomainHandler = {
  getTools,
  handleCall,
};
