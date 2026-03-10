/**
 * Shared types for the Checkpoint Harmony Email & Collaboration (Avanan) MCP server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool call result type - inline definition for MCP SDK compatibility
 */
export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Domain handler interface
 */
export interface DomainHandler {
  /** Get the tools for this domain */
  getTools(): Tool[];
  /** Handle a tool call */
  handleCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult>;
}

/**
 * Domain names for Checkpoint Harmony Email & Collaboration
 */
export type DomainName =
  | "quarantine"
  | "threats"
  | "events"
  | "policies"
  | "users"
  | "reports"
  | "incidents"
  | "banners"
  | "saas";

/**
 * All valid domain names
 */
const DOMAIN_NAMES: DomainName[] = [
  "quarantine",
  "threats",
  "events",
  "policies",
  "users",
  "reports",
  "incidents",
  "banners",
  "saas",
];

/**
 * Check if a string is a valid domain name
 */
export function isDomainName(value: string): value is DomainName {
  return DOMAIN_NAMES.includes(value as DomainName);
}

/**
 * Checkpoint Harmony credentials extracted from environment or gateway headers
 */
export interface CheckpointCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}
