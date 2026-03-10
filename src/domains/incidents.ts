/**
 * Incidents domain handler
 *
 * Provides tools for incident investigation and response:
 * - List security incidents
 * - Get incident details
 * - Update incident status
 * - Add incident notes
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitSelection, elicitConfirmation } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_incidents_list",
      description:
        "List security incidents. Returns incidents with status, severity, affected users, and summary.",
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
            enum: ["open", "investigating", "resolved", "closed"],
            description: "Filter by incident status",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "Filter by incident severity",
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
      name: "avanan_incidents_get",
      description:
        "Get detailed information about a specific incident, including timeline, affected entities, and remediation actions.",
      inputSchema: {
        type: "object" as const,
        properties: {
          incident_id: {
            type: "string",
            description: "The incident ID",
          },
        },
        required: ["incident_id"],
      },
    },
    {
      name: "avanan_incidents_update_status",
      description:
        "Update the status of an incident (e.g., mark as investigating, resolved, or closed).",
      inputSchema: {
        type: "object" as const,
        properties: {
          incident_id: {
            type: "string",
            description: "The incident ID to update",
          },
          status: {
            type: "string",
            enum: ["investigating", "resolved", "closed"],
            description: "The new incident status",
          },
          note: {
            type: "string",
            description: "Optional note explaining the status change",
          },
        },
        required: ["incident_id", "status"],
      },
    },
    {
      name: "avanan_incidents_add_note",
      description:
        "Add an investigation note to an incident.",
      inputSchema: {
        type: "object" as const,
        properties: {
          incident_id: {
            type: "string",
            description: "The incident ID",
          },
          note: {
            type: "string",
            description: "The investigation note text",
          },
        },
        required: ["incident_id", "note"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_incidents_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      const status = args.status as string | undefined;
      const severity = args.severity as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;

      // If no filters, suggest filtering by status
      if (!status && !severity && !dateFrom) {
        const selected = await elicitSelection(
          "No filters specified. Would you like to filter incidents by status?",
          "status",
          [
            { value: "open", label: "Open" },
            { value: "investigating", label: "Investigating" },
            { value: "all", label: "All Statuses" },
          ]
        );
        if (selected && selected !== "all") {
          args = { ...args, status: selected };
        }
      }

      logger.info("API call: incidents.list", { page, limit, status, severity });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (args.status) params.status = args.status as string;
      if (severity) params.severity = severity;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/incidents", { params });

      const incidents = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ incidents, page, limit }, null, 2),
          },
        ],
      };
    }

    case "avanan_incidents_get": {
      const incidentId = args.incident_id as string;
      if (!incidentId) {
        return {
          content: [{ type: "text", text: "Error: incident_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: incidents.get", { incidentId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/incidents/${encodeURIComponent(incidentId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_incidents_update_status": {
      const incidentId = args.incident_id as string;
      const status = args.status as string;
      const note = args.note as string | undefined;

      if (!incidentId) {
        return {
          content: [{ type: "text", text: "Error: incident_id is required" }],
          isError: true,
        };
      }

      if (!status) {
        return {
          content: [{ type: "text", text: "Error: status is required" }],
          isError: true,
        };
      }

      const confirmed = await elicitConfirmation(
        `Are you sure you want to change incident ${incidentId} status to "${status}"?`
      );
      if (confirmed === false) {
        return {
          content: [{ type: "text", text: "Status update cancelled by user." }],
        };
      }

      logger.info("API call: incidents.updateStatus", { incidentId, status });

      const body: Record<string, unknown> = { status };
      if (note) body.note = note;

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/incidents/${encodeURIComponent(incidentId)}/status`,
        { method: "PUT", body }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Incident ${incidentId} status updated to ${status}`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    case "avanan_incidents_add_note": {
      const incidentId = args.incident_id as string;
      const note = args.note as string;

      if (!incidentId) {
        return {
          content: [{ type: "text", text: "Error: incident_id is required" }],
          isError: true,
        };
      }

      if (!note) {
        return {
          content: [{ type: "text", text: "Error: note is required" }],
          isError: true,
        };
      }

      logger.info("API call: incidents.addNote", { incidentId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/incidents/${encodeURIComponent(incidentId)}/notes`,
        { method: "POST", body: { note } }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Note added to incident ${incidentId}`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown incidents tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const incidentsHandler: DomainHandler = {
  getTools,
  handleCall,
};
