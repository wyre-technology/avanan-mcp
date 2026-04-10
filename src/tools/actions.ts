/**
 * Action tools — quarantine and restore events or email entities.
 *
 * Actions are asynchronous; they return a taskId to poll with hec_get_task_status.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiRequest } from "../utils/client.js";
import type { CallToolResult } from "../utils/types.js";

export const actionTools: Tool[] = [
  {
    name: "hec_quarantine_events",
    description:
      "Quarantine one or more security events by event ID. Returns task IDs to track progress.",
    inputSchema: {
      type: "object",
      properties: {
        eventIds: {
          type: "array",
          items: { type: "string" },
          description: "List of event IDs to quarantine",
          minItems: 1,
        },
      },
      required: ["eventIds"],
    },
  },
  {
    name: "hec_restore_events",
    description:
      "Restore one or more previously quarantined events by event ID. Returns task IDs to track progress.",
    inputSchema: {
      type: "object",
      properties: {
        eventIds: {
          type: "array",
          items: { type: "string" },
          description: "List of event IDs to restore",
          minItems: 1,
        },
      },
      required: ["eventIds"],
    },
  },
  {
    name: "hec_quarantine_emails",
    description:
      "Quarantine specific email entities by entity ID. Returns task IDs to track progress.",
    inputSchema: {
      type: "object",
      properties: {
        entityIds: {
          type: "array",
          items: { type: "string" },
          description: "List of entity IDs to quarantine",
          minItems: 1,
        },
        entityType: {
          type: "string",
          description: "Entity type (e.g. email)",
          default: "email",
        },
      },
      required: ["entityIds"],
    },
  },
  {
    name: "hec_restore_emails",
    description: "Restore specific quarantined email entities by entity ID.",
    inputSchema: {
      type: "object",
      properties: {
        entityIds: {
          type: "array",
          items: { type: "string" },
          description: "List of entity IDs to restore",
          minItems: 1,
        },
        entityType: {
          type: "string",
          description: "Entity type (e.g. email)",
          default: "email",
        },
      },
      required: ["entityIds"],
    },
  },
  {
    name: "hec_get_task_status",
    description:
      "Check the status of an action task (quarantine/restore). Use the taskId returned by quarantine or restore tools.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID from a quarantine or restore action" },
      },
      required: ["taskId"],
    },
  },
];

export async function handleActionTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (name === "hec_quarantine_events" || name === "hec_restore_events") {
    const actionName = name === "hec_quarantine_events" ? "quarantine" : "restore";
    const result = await apiRequest<{ eventId: string; entityId: string; taskId: string }>(
      "/v1.0/action/event",
      {
        method: "POST",
        body: {
          requestData: {
            eventIds: args.eventIds,
            eventActionName: actionName,
          },
        },
      }
    );

    const tasks = result.responseData.map((r) => ({
      eventId: r.eventId,
      entityId: r.entityId,
      taskId: r.taskId,
    }));

    return {
      content: [
        {
          type: "text",
          text: `${actionName === "quarantine" ? "Quarantine" : "Restore"} initiated for ${tasks.length} event(s).\n\nUse hec_get_task_status to check progress.\n\n${JSON.stringify(tasks, null, 2)}`,
        },
      ],
    };
  }

  if (name === "hec_quarantine_emails" || name === "hec_restore_emails") {
    const actionName = name === "hec_quarantine_emails" ? "quarantine" : "restore";
    const result = await apiRequest<{ entityId: string; taskId: string }>("/v1.0/action/entity", {
      method: "POST",
      body: {
        requestData: {
          entityIds: args.entityIds,
          entityType: (args.entityType as string) ?? "email",
          entityActionName: actionName,
        },
      },
    });

    const tasks = result.responseData.map((r) => ({
      entityId: r.entityId,
      taskId: r.taskId,
    }));

    return {
      content: [
        {
          type: "text",
          text: `${actionName === "quarantine" ? "Quarantine" : "Restore"} initiated for ${tasks.length} email(s).\n\nUse hec_get_task_status to check progress.\n\n${JSON.stringify(tasks, null, 2)}`,
        },
      ],
    };
  }

  if (name === "hec_get_task_status") {
    const taskId = args.taskId as string;
    const result = await apiRequest<Record<string, unknown>>(
      `/v1.0/task/${encodeURIComponent(taskId)}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.responseData, null, 2) || "Task not yet complete.",
        },
      ],
    };
  }

  throw new Error(`Unknown action tool: ${name}`);
}
