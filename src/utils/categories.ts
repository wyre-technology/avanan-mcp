/**
 * Tool categories for lazy loading meta-tools mode.
 *
 * Maps each domain to a human-readable description and the
 * tool names that belong to it.  Used by the four meta-tools
 * (avanan_list_categories, avanan_list_category_tools,
 *  avanan_execute_tool, avanan_router) when LAZY_LOADING=true.
 */

import type { DomainName } from "./types.js";

export interface CategoryInfo {
  description: string;
  tools: string[];
}

export const TOOL_CATEGORIES: Record<string, CategoryInfo> = {
  quarantine: {
    description: "Manage quarantined emails - list, get details, release, or permanently delete",
    tools: [
      "avanan_quarantine_list",
      "avanan_quarantine_get",
      "avanan_quarantine_release",
      "avanan_quarantine_delete",
    ],
  },
  threats: {
    description: "Threat detection and analysis - list threats, get details, IOCs, and timelines",
    tools: [
      "avanan_threats_list",
      "avanan_threats_get",
      "avanan_threats_iocs",
      "avanan_threats_timeline",
    ],
  },
  events: {
    description: "Security events and alerts - list events, get event details, list active alerts",
    tools: [
      "avanan_events_list",
      "avanan_events_get",
      "avanan_alerts_list",
    ],
  },
  policies: {
    description: "Policy management - list, inspect, and enable/disable DLP, anti-phishing, and anti-malware policies",
    tools: [
      "avanan_policies_list",
      "avanan_policies_get",
      "avanan_policies_update_status",
    ],
  },
  users: {
    description: "User and entity management - list protected users, get details, view threat history",
    tools: [
      "avanan_users_list",
      "avanan_users_get",
      "avanan_users_threat_history",
    ],
  },
  reports: {
    description: "Security reports and statistics - threat summaries, email flow stats, protection effectiveness",
    tools: [
      "avanan_reports_threat_summary",
      "avanan_reports_email_stats",
      "avanan_reports_protection",
    ],
  },
  incidents: {
    description: "Incident investigation and response - list, inspect, update status, and annotate incidents",
    tools: [
      "avanan_incidents_list",
      "avanan_incidents_get",
      "avanan_incidents_update_status",
      "avanan_incidents_add_note",
    ],
  },
  banners: {
    description: "Smart Banners management - list, inspect, and update email warning banners",
    tools: [
      "avanan_banners_list",
      "avanan_banners_get",
      "avanan_banners_update",
    ],
  },
  saas: {
    description: "SaaS application protection - list protected apps, get status, view security summaries",
    tools: [
      "avanan_saas_list",
      "avanan_saas_get",
      "avanan_saas_security_summary",
    ],
  },
};

/**
 * Resolve which domain (category) a tool belongs to.
 * Returns undefined if the tool is not found in any category.
 */
export function domainForTool(toolName: string): DomainName | undefined {
  for (const [domain, info] of Object.entries(TOOL_CATEGORIES)) {
    if (info.tools.includes(toolName)) {
      return domain as DomainName;
    }
  }
  return undefined;
}

/**
 * Get a flat list of every tool name across all categories.
 */
export function allToolNames(): string[] {
  return Object.values(TOOL_CATEGORIES).flatMap((c) => c.tools);
}
