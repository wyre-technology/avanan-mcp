/**
 * Threats domain handler
 *
 * Provides tools for threat detection and analysis:
 * - List detected threats
 * - Get threat details
 * - Get indicators of compromise (IOCs)
 * - Get threat timeline
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitSelection } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_threats_list",
      description:
        "List detected threats. Returns phishing, malware, and other threats detected by Harmony Email.",
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
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "Filter by threat severity",
          },
          threat_type: {
            type: "string",
            enum: ["phishing", "malware", "spam", "dlp", "anomaly"],
            description: "Filter by threat type",
          },
          date_from: {
            type: "string",
            description: "Start date filter (ISO 8601 format)",
          },
          date_to: {
            type: "string",
            description: "End date filter (ISO 8601 format)",
          },
          state: {
            type: "string",
            enum: ["detected", "remediated", "dismissed"],
            description: "Filter by threat state",
          },
        },
      },
    },
    {
      name: "avanan_threats_get",
      description:
        "Get detailed information about a specific threat by ID, including attack vectors, impacted users, and remediation status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          threat_id: {
            type: "string",
            description: "The threat ID",
          },
        },
        required: ["threat_id"],
      },
    },
    {
      name: "avanan_threats_iocs",
      description:
        "Get indicators of compromise (IOCs) for a specific threat. Returns URLs, file hashes, IP addresses, and email addresses associated with the threat.",
      inputSchema: {
        type: "object" as const,
        properties: {
          threat_id: {
            type: "string",
            description: "The threat ID to get IOCs for",
          },
        },
        required: ["threat_id"],
      },
    },
    {
      name: "avanan_threats_timeline",
      description:
        "Get the timeline of events for a specific threat, showing detection, analysis, and remediation steps.",
      inputSchema: {
        type: "object" as const,
        properties: {
          threat_id: {
            type: "string",
            description: "The threat ID to get timeline for",
          },
        },
        required: ["threat_id"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_threats_list": {
      const page = (args.page as number) || 1;
      const limit = (args.limit as number) || 50;
      const severity = args.severity as string | undefined;
      let threatType = args.threat_type as string | undefined;
      const dateFrom = args.date_from as string | undefined;
      const dateTo = args.date_to as string | undefined;
      const state = args.state as string | undefined;

      // If no filters provided, ask the user to pick a severity level
      if (!severity && !threatType && !dateFrom && !state) {
        const selected = await elicitSelection(
          "No filters specified. Would you like to filter threats by severity?",
          "severity",
          [
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "all", label: "All Severities" },
          ]
        );
        if (selected && selected !== "all") {
          args = { ...args, severity: selected };
        }
      }

      logger.info("API call: threats.list", { page, limit, severity, threatType });

      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      };

      if (args.severity) params.severity = args.severity as string;
      if (threatType) params.threat_type = threatType;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (state) params.state = state;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/threats", { params });

      const threats = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ threats, page, limit }, null, 2),
          },
        ],
      };
    }

    case "avanan_threats_get": {
      const threatId = args.threat_id as string;
      if (!threatId) {
        return {
          content: [{ type: "text", text: "Error: threat_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: threats.get", { threatId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/threats/${encodeURIComponent(threatId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_threats_iocs": {
      const threatId = args.threat_id as string;
      if (!threatId) {
        return {
          content: [{ type: "text", text: "Error: threat_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: threats.iocs", { threatId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/threats/${encodeURIComponent(threatId)}/iocs`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_threats_timeline": {
      const threatId = args.threat_id as string;
      if (!threatId) {
        return {
          content: [{ type: "text", text: "Error: threat_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: threats.timeline", { threatId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/threats/${encodeURIComponent(threatId)}/timeline`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown threats tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const threatsHandler: DomainHandler = {
  getTools,
  handleCall,
};
