/**
 * Shared response formatting utilities.
 */

import type { ApiResponse } from "./types.js";
import type { CallToolResult } from "./types.js";

/**
 * Format a paged API response into a human-readable CallToolResult.
 * Extracts record count, optional scroll ID, and a pre-built summary array.
 */
export function formatPagedResult<T>(
  result: ApiResponse<T>,
  summary: unknown[],
  label: string
): CallToolResult {
  const count = result.responseEnvelope.recordsNumber ?? result.responseData.length;
  const scrollId = result.responseEnvelope.scrollId;

  const lines = [
    `Found ${count} ${label}${count !== 1 ? "s" : ""}.`,
    ...(scrollId ? [`Next page scroll ID: ${scrollId}`] : []),
    "",
    JSON.stringify(summary, null, 2),
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
