/**
 * Exception tools — manage whitelist and blacklist entries.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiRequest } from "../utils/client.js";
import type { HecException, ApiResponse } from "../utils/types.js";
import type { CallToolResult } from "../utils/types.js";

const EXC_TYPES = ["whitelist", "blacklist"] as const;
type ExcType = (typeof EXC_TYPES)[number];

export const exceptionTools: Tool[] = [
  {
    name: "hec_list_exceptions",
    description: "List whitelist or blacklist entries in Checkpoint Harmony Email.",
    inputSchema: {
      type: "object",
      properties: {
        excType: {
          type: "string",
          enum: ["whitelist", "blacklist"],
          description: "Whether to list the whitelist or blacklist",
        },
      },
      required: ["excType"],
    },
  },
  {
    name: "hec_add_exception",
    description:
      "Add an entry to the whitelist or blacklist. At least one match field (senderEmail, senderDomain, subject, attachmentMd5, recipient) must be provided.",
    inputSchema: {
      type: "object",
      properties: {
        excType: {
          type: "string",
          enum: ["whitelist", "blacklist"],
          description: "Whether to add to the whitelist or blacklist",
        },
        senderEmail: { type: "string", description: "Sender email address" },
        senderDomain: { type: "string", description: "Sender domain" },
        senderName: { type: "string", description: "Sender display name" },
        recipient: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        attachmentMd5: { type: "string", description: "Attachment MD5 hash" },
        comment: { type: "string", description: "Comment explaining the exception" },
        senderEmailMatching: {
          type: "string",
          enum: ["matching", "contains"],
          default: "matching",
        },
        senderDomainMatching: {
          type: "string",
          enum: ["contains", "endswith"],
          default: "endswith",
        },
        subjectMatching: {
          type: "string",
          enum: ["matching", "contains"],
          default: "contains",
        },
      },
      required: ["excType"],
    },
  },
  {
    name: "hec_update_exception",
    description: "Update an existing whitelist or blacklist entry by its entity ID.",
    inputSchema: {
      type: "object",
      properties: {
        excType: {
          type: "string",
          enum: ["whitelist", "blacklist"],
        },
        excId: { type: "string", description: "The exception entity ID to update" },
        senderEmail: { type: "string" },
        senderDomain: { type: "string" },
        senderName: { type: "string" },
        recipient: { type: "string" },
        subject: { type: "string" },
        attachmentMd5: { type: "string" },
        comment: { type: "string" },
        senderEmailMatching: { type: "string", enum: ["matching", "contains"] },
        senderDomainMatching: { type: "string", enum: ["contains", "endswith"] },
        subjectMatching: { type: "string", enum: ["matching", "contains"] },
      },
      required: ["excType", "excId"],
    },
  },
  {
    name: "hec_delete_exception",
    description:
      "⚠ DESTRUCTIVE — IRREVERSIBLE. Delete a whitelist or blacklist entry by its entity ID. " +
      "This action cannot be undone and will permanently remove the exception from security policy. " +
      "Confirm with the user before invoking.",
    annotations: {
      title: "Delete exception (irreversible)",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        excType: {
          type: "string",
          enum: ["whitelist", "blacklist"],
        },
        excId: { type: "string", description: "The exception entity ID to delete" },
      },
      required: ["excType", "excId"],
    },
  },
];

function buildExceptionBody(args: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    "senderEmail", "senderDomain", "senderName", "recipient", "subject",
    "attachmentMd5", "comment", "senderEmailMatching", "senderDomainMatching",
    "subjectMatching", "linkDomainMatching", "senderNameMatching", "recipientMatching",
    "ignoringSpfCheck", "linkDomains", "senderClientIp", "senderIp", "actionNeeded",
  ];
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (args[f] !== undefined) body[f] = args[f];
  }
  return body;
}

export async function handleExceptionTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const excType = args.excType as ExcType;

  if (name === "hec_list_exceptions") {
    const result = await apiRequest<HecException>(`/v1.0/exceptions/${excType}`);
    return formatList(result, excType);
  }

  if (name === "hec_add_exception") {
    const result = await apiRequest<HecException>(`/v1.0/exceptions/${excType}`, {
      method: "POST",
      body: { requestData: buildExceptionBody(args) },
    });
    return {
      content: [
        {
          type: "text",
          text: `Exception added to ${excType}.\n${JSON.stringify(result.responseData, null, 2)}`,
        },
      ],
    };
  }

  if (name === "hec_update_exception") {
    const excId = args.excId as string;
    const result = await apiRequest<HecException>(
      `/v1.0/exceptions/${excType}/${encodeURIComponent(excId)}`,
      {
        method: "PUT",
        body: { requestData: buildExceptionBody(args) },
      }
    );
    return {
      content: [
        {
          type: "text",
          text: `Exception updated.\n${JSON.stringify(result.responseData, null, 2)}`,
        },
      ],
    };
  }

  if (name === "hec_delete_exception") {
    const excId = args.excId as string;
    await apiRequest<unknown>(
      `/v1.0/exceptions/${excType}/delete/${encodeURIComponent(excId)}`,
      { method: "POST" }
    );
    return {
      content: [{ type: "text", text: `Exception ${excId} deleted from ${excType}.` }],
    };
  }

  throw new Error(`Unknown exception tool: ${name}`);
}

function formatList(result: ApiResponse<HecException>, excType: string): CallToolResult {
  const count = result.responseData.length;
  const summary = result.responseData.map((e) => ({
    entityId: e.entityId,
    senderEmail: e.senderEmail,
    senderDomain: e.senderDomain,
    recipient: e.recipient,
    subject: e.subject,
    comment: e.comment,
    addedBy: e.addedBy,
    updateTime: e.updateTime,
  }));
  return {
    content: [
      {
        type: "text",
        text: `${count} ${excType} entr${count !== 1 ? "ies" : "y"}.\n\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  };
}
