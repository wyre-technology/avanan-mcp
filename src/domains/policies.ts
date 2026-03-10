/**
 * Policies domain handler
 *
 * Provides tools for managing security policies:
 * - List policies (DLP, anti-phishing, anti-malware)
 * - Get policy details
 * - Update policy status (enable/disable)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { apiRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import { elicitConfirmation } from "../utils/elicitation.js";

function getTools(): Tool[] {
  return [
    {
      name: "avanan_policies_list",
      description:
        "List security policies. Returns DLP, anti-phishing, anti-malware, and other configured policies.",
      inputSchema: {
        type: "object" as const,
        properties: {
          policy_type: {
            type: "string",
            enum: ["dlp", "anti_phishing", "anti_malware", "threat_emulation", "url_protection", "all"],
            description: "Filter by policy type (default: all)",
          },
          status: {
            type: "string",
            enum: ["enabled", "disabled", "all"],
            description: "Filter by policy status (default: all)",
          },
        },
      },
    },
    {
      name: "avanan_policies_get",
      description:
        "Get detailed information about a specific policy by ID, including rules and conditions.",
      inputSchema: {
        type: "object" as const,
        properties: {
          policy_id: {
            type: "string",
            description: "The policy ID",
          },
        },
        required: ["policy_id"],
      },
    },
    {
      name: "avanan_policies_update_status",
      description:
        "Enable or disable a specific policy. Requires confirmation before changing policy state.",
      inputSchema: {
        type: "object" as const,
        properties: {
          policy_id: {
            type: "string",
            description: "The policy ID to update",
          },
          enabled: {
            type: "boolean",
            description: "Whether the policy should be enabled (true) or disabled (false)",
          },
        },
        required: ["policy_id", "enabled"],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "avanan_policies_list": {
      const policyType = args.policy_type as string | undefined;
      const status = args.status as string | undefined;

      logger.info("API call: policies.list", { policyType, status });

      const params: Record<string, string | number | boolean | undefined> = {};

      if (policyType && policyType !== "all") params.policy_type = policyType;
      if (status && status !== "all") params.status = status;

      const result = await apiRequest<unknown>("/app/hec-api/v1.0/policies", { params });

      const policies = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>)?.data ?? result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ policies }, null, 2),
          },
        ],
      };
    }

    case "avanan_policies_get": {
      const policyId = args.policy_id as string;
      if (!policyId) {
        return {
          content: [{ type: "text", text: "Error: policy_id is required" }],
          isError: true,
        };
      }

      logger.info("API call: policies.get", { policyId });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/policies/${encodeURIComponent(policyId)}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "avanan_policies_update_status": {
      const policyId = args.policy_id as string;
      const enabled = args.enabled as boolean;

      if (!policyId) {
        return {
          content: [{ type: "text", text: "Error: policy_id is required" }],
          isError: true,
        };
      }

      if (typeof enabled !== "boolean") {
        return {
          content: [{ type: "text", text: "Error: enabled must be a boolean" }],
          isError: true,
        };
      }

      const action = enabled ? "enable" : "disable";
      const confirmed = await elicitConfirmation(
        `Are you sure you want to ${action} policy ${policyId}? This will affect email security filtering.`
      );
      if (confirmed === false) {
        return {
          content: [{ type: "text", text: `Policy ${action} cancelled by user.` }],
        };
      }

      logger.info("API call: policies.updateStatus", { policyId, enabled });

      const result = await apiRequest<unknown>(
        `/app/hec-api/v1.0/policies/${encodeURIComponent(policyId)}`,
        {
          method: "PUT",
          body: { enabled },
        }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: `Policy ${policyId} ${action}d successfully`, result },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown policies tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const policiesHandler: DomainHandler = {
  getTools,
  handleCall,
};
