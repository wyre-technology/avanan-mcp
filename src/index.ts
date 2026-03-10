#!/usr/bin/env node
/**
 * Checkpoint Harmony Email & Collaboration (Avanan) MCP Server
 * with Decision Tree Architecture
 *
 * This MCP server uses a hierarchical tool loading approach:
 * 1. Initially exposes only a navigation tool
 * 2. After user selects a domain, exposes domain-specific tools
 * 3. Lazy-loads domain handlers on first access
 *
 * Supports both stdio and HTTP transports:
 * - stdio (default): For local Claude Desktop / CLI usage
 * - http: For hosted deployment with optional gateway auth
 *
 * Auth modes:
 * - env (default): Credentials from CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET
 * - gateway: Credentials injected from request headers by the MCP gateway
 *   - Headers: X-Checkpoint-Client-Id, X-Checkpoint-Client-Secret
 *
 * Domains:
 * - quarantine: Manage quarantined emails (list, release, delete)
 * - threats: Threat detection and analysis (threats, IOCs, timelines)
 * - events: Security events and alerts
 * - policies: Policy management (DLP, anti-phishing, anti-malware)
 * - users: User and entity management
 * - reports: Security reports and statistics
 * - incidents: Incident investigation and response
 * - banners: Smart Banners management
 * - saas: SaaS application protection status
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { isDomainName, type DomainName } from "./utils/types.js";
import { getCredentials } from "./utils/client.js";
import { logger } from "./utils/logger.js";
import { setServerRef } from "./utils/server-ref.js";
import { TOOL_CATEGORIES, domainForTool, allToolNames } from "./utils/categories.js";

// Server navigation state
let currentDomain: DomainName | null = null;

// Create the MCP server
const server = new Server(
  {
    name: "mcp-server-checkpoint-avanan",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

setServerRef(server);

/**
 * Navigation tool - shown when at root (no domain selected)
 */
const navigateTool: Tool = {
  name: "avanan_navigate",
  description:
    "Navigate to a Checkpoint Harmony Email domain to access its tools. Available domains: quarantine (manage quarantined emails), threats (threat detection and analysis), events (security events and alerts), policies (DLP, anti-phishing, anti-malware policies), users (user/entity management), reports (security reports and statistics), incidents (incident investigation), banners (Smart Banners), saas (SaaS app protection).",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: getAvailableDomains(),
        description:
          "The domain to navigate to",
      },
    },
    required: ["domain"],
  },
};

/**
 * Back navigation tool - shown when inside a domain
 */
const backTool: Tool = {
  name: "avanan_back",
  description: "Navigate back to the main menu to select a different domain",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Status tool - always available
 */
const statusTool: Tool = {
  name: "avanan_status",
  description:
    "Show current navigation state and available domains. Also verifies API credentials are configured.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

// ---------------------------------------------------------------------------
// Lazy-loading meta-tools (enabled via LAZY_LOADING=true env var)
// ---------------------------------------------------------------------------

const metaToolListCategories: Tool = {
  name: "avanan_list_categories",
  description:
    "List all available tool categories with descriptions and tool counts. Use this first to discover what capabilities are available.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const metaToolListCategoryTools: Tool = {
  name: "avanan_list_category_tools",
  description:
    "List all tools in a specific category with their full schemas (parameters, descriptions). Use after avanan_list_categories to explore a category.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: Object.keys(TOOL_CATEGORIES),
        description: "The category name to list tools for",
      },
    },
    required: ["category"],
  },
};

const metaToolExecute: Tool = {
  name: "avanan_execute_tool",
  description:
    "Execute any Checkpoint Harmony Email tool by name. Use avanan_list_category_tools first to discover available tools and their parameters.",
  inputSchema: {
    type: "object",
    properties: {
      toolName: {
        type: "string",
        description: "The tool name to execute (e.g. avanan_quarantine_list)",
      },
      arguments: {
        type: "object",
        description: "Arguments to pass to the tool",
        additionalProperties: true,
      },
    },
    required: ["toolName"],
  },
};

const metaToolRouter: Tool = {
  name: "avanan_router",
  description:
    "Suggest the best tool(s) for a natural-language intent. Describe what you want to do and this tool will recommend which tools to call and with what parameters.",
  inputSchema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        description: "Natural language description of what you want to accomplish",
      },
    },
    required: ["intent"],
  },
};

const metaTools: Tool[] = [
  metaToolListCategories,
  metaToolListCategoryTools,
  metaToolExecute,
  metaToolRouter,
];

/**
 * Whether the server is running in lazy-loading meta-tools mode.
 */
function isLazyLoading(): boolean {
  return process.env.LAZY_LOADING === "true";
}

/**
 * Get tools based on current navigation state
 */
async function getToolsForState(): Promise<Tool[]> {
  const tools: Tool[] = [statusTool];

  if (currentDomain === null) {
    tools.unshift(navigateTool);
  } else {
    tools.unshift(backTool);
    const handler = await getDomainHandler(currentDomain);
    const domainTools = handler.getTools();
    tools.push(...domainTools);
  }

  return tools;
}

// Handle ListTools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (isLazyLoading()) {
    return { tools: metaTools };
  }
  const tools = await getToolsForState();
  return { tools };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info("Tool call received", { tool: name, arguments: args });

  try {
    // -----------------------------------------------------------------------
    // Lazy-loading meta-tool handlers (always available so they work
    // regardless of mode — but ListTools only advertises them when
    // LAZY_LOADING=true)
    // -----------------------------------------------------------------------

    if (name === "avanan_list_categories") {
      const categories = Object.entries(TOOL_CATEGORIES).map(
        ([categoryName, info]) => ({
          name: categoryName,
          description: info.description,
          toolCount: info.tools.length,
        })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(categories, null, 2),
          },
        ],
      };
    }

    if (name === "avanan_list_category_tools") {
      const category = (args as { category: string }).category;
      const info = TOOL_CATEGORIES[category];
      if (!info) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown category: '${category}'. Valid categories: ${Object.keys(TOOL_CATEGORIES).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Lazy-load the domain handler to get full tool schemas
      const handler = await getDomainHandler(category as DomainName);
      const domainTools = handler.getTools();
      const filtered = domainTools.filter((t) => info.tools.includes(t.name));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(filtered, null, 2),
          },
        ],
      };
    }

    if (name === "avanan_execute_tool") {
      const toolName = (args as { toolName: string; arguments?: Record<string, unknown> }).toolName;
      const toolArgs = (args as { toolName: string; arguments?: Record<string, unknown> }).arguments || {};

      if (!allToolNames().includes(toolName)) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: '${toolName}'. Use avanan_list_categories and avanan_list_category_tools to discover available tools.`,
            },
          ],
          isError: true,
        };
      }

      const domain = domainForTool(toolName)!;
      const handler = await getDomainHandler(domain);
      const result = await handler.handleCall(toolName, toolArgs);
      logger.debug("Meta-tool execute completed", {
        tool: toolName,
        responseSize: JSON.stringify(result).length,
      });
      return result;
    }

    if (name === "avanan_router") {
      const intent = ((args as { intent: string }).intent || "").toLowerCase();

      // Simple keyword-to-tool routing
      const routingRules: Array<{
        keywords: string[];
        tool: string;
        description: string;
        suggestedParams?: Record<string, unknown>;
      }> = [
        { keywords: ["quarantine", "quarantined", "held", "release email"], tool: "avanan_quarantine_list", description: "List quarantined emails" },
        { keywords: ["release", "unquarantine", "deliver"], tool: "avanan_quarantine_release", description: "Release a quarantined email", suggestedParams: { entity_id: "<required>" } },
        { keywords: ["threat", "phishing", "malware", "attack"], tool: "avanan_threats_list", description: "List detected threats" },
        { keywords: ["ioc", "indicator", "compromise", "hash", "ip address"], tool: "avanan_threats_iocs", description: "Get IOCs for a threat", suggestedParams: { threat_id: "<required>" } },
        { keywords: ["timeline", "threat history", "attack chain"], tool: "avanan_threats_timeline", description: "Get threat timeline", suggestedParams: { threat_id: "<required>" } },
        { keywords: ["event", "alert", "security event"], tool: "avanan_events_list", description: "List security events" },
        { keywords: ["alert", "active alert"], tool: "avanan_alerts_list", description: "List active alerts" },
        { keywords: ["policy", "policies", "dlp", "anti-phishing", "anti-malware"], tool: "avanan_policies_list", description: "List security policies" },
        { keywords: ["enable policy", "disable policy", "toggle policy"], tool: "avanan_policies_update_status", description: "Enable or disable a policy", suggestedParams: { policy_id: "<required>", enabled: true } },
        { keywords: ["user", "users", "entity", "protected user"], tool: "avanan_users_list", description: "List protected users" },
        { keywords: ["user threat", "user risk", "who was targeted"], tool: "avanan_users_threat_history", description: "Get threat history for a user", suggestedParams: { user_id: "<required>" } },
        { keywords: ["report", "summary", "statistics", "stats"], tool: "avanan_reports_threat_summary", description: "Get threat summary report" },
        { keywords: ["email stats", "email flow", "volume", "blocked count"], tool: "avanan_reports_email_stats", description: "Get email flow statistics" },
        { keywords: ["protection", "effectiveness", "detection rate"], tool: "avanan_reports_protection", description: "Get protection effectiveness report" },
        { keywords: ["incident", "investigation", "respond"], tool: "avanan_incidents_list", description: "List security incidents" },
        { keywords: ["update incident", "close incident", "resolve incident"], tool: "avanan_incidents_update_status", description: "Update incident status", suggestedParams: { incident_id: "<required>", status: "<required>" } },
        { keywords: ["note", "annotate", "comment on incident"], tool: "avanan_incidents_add_note", description: "Add note to incident", suggestedParams: { incident_id: "<required>", note: "<required>" } },
        { keywords: ["banner", "smart banner", "warning banner"], tool: "avanan_banners_list", description: "List Smart Banners" },
        { keywords: ["saas", "application", "m365", "google workspace", "slack", "connected app"], tool: "avanan_saas_list", description: "List protected SaaS applications" },
        { keywords: ["saas security", "app security", "app summary"], tool: "avanan_saas_security_summary", description: "Get SaaS app security summary", suggestedParams: { app_id: "<required>" } },
      ];

      const matches = routingRules
        .map((rule) => {
          const score = rule.keywords.filter((kw) => intent.includes(kw)).length;
          return { ...rule, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: "No matching tools found for that intent. Try avanan_list_categories to browse available capabilities.",
                  availableCategories: Object.keys(TOOL_CATEGORIES),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const suggestions = matches.map((m) => ({
        tool: m.tool,
        description: m.description,
        ...(m.suggestedParams ? { suggestedParams: m.suggestedParams } : {}),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ suggestions }, null, 2),
          },
        ],
      };
    }

    // Navigate to a domain
    if (name === "avanan_navigate") {
      const domain = (args as { domain: string }).domain;

      if (!isDomainName(domain)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid domain: '${domain}'. Available domains: ${getAvailableDomains().join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Validate credentials before allowing navigation
      const creds = getCredentials();
      if (!creds) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No API credentials configured. Please set CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET environment variables.",
            },
          ],
          isError: true,
        };
      }

      currentDomain = domain;
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();

      logger.info("Navigated to domain", { domain, toolCount: domainTools.length });

      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${domain} domain.\n\nAvailable tools:\n${domainTools
              .map((t) => `- ${t.name}: ${t.description}`)
              .join("\n")}\n\nUse avanan_back to return to the main menu.`,
          },
        ],
      };
    }

    // Navigate back to root
    if (name === "avanan_back") {
      const previousDomain = currentDomain;
      currentDomain = null;

      return {
        content: [
          {
            type: "text",
            text: `Navigated back from ${previousDomain || "root"} to the main menu.\n\nAvailable domains: ${getAvailableDomains().join(", ")}\n\nUse avanan_navigate to select a domain.`,
          },
        ],
      };
    }

    // Status check
    if (name === "avanan_status") {
      const creds = getCredentials();
      const credStatus = creds
        ? "Configured"
        : "NOT CONFIGURED - Please set CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET environment variables";

      return {
        content: [
          {
            type: "text",
            text: `Checkpoint Harmony Email & Collaboration MCP Server Status\n\nCurrent domain: ${currentDomain || "(none - at main menu)"}\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}`,
          },
        ],
      };
    }

    // Domain-specific tool calls
    if (currentDomain !== null) {
      const handler = await getDomainHandler(currentDomain);
      const domainTools = handler.getTools();
      const toolExists = domainTools.some((t) => t.name === name);

      if (toolExists) {
        const result = await handler.handleCall(name, args as Record<string, unknown>);
        logger.debug("Tool call completed", {
          tool: name,
          responseSize: JSON.stringify(result).length,
        });
        return result;
      }
    }

    // Tool not found
    return {
      content: [
        {
          type: "text",
          text: currentDomain
            ? `Unknown tool: '${name}'. You are in the '${currentDomain}' domain. Use avanan_back to return to the main menu.`
            : `Unknown tool: '${name}'. Use avanan_navigate to select a domain first.`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("Tool call failed", { tool: name, error: message, stack });
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = isLazyLoading() ? "lazy loading meta-tools" : "decision tree";
  logger.info(`Checkpoint Harmony MCP server running on stdio (${mode} mode)`);
}

/**
 * Start the server with HTTP Streamable transport.
 * In gateway mode (AUTH_MODE=gateway), credentials are extracted
 * from the X-Checkpoint-Client-Id and X-Checkpoint-Client-Secret request headers.
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Health check - no auth required
    if (url.pathname === "/health") {
      const creds = getCredentials();
      const statusCode = creds ? 200 : 503;

      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: creds ? "ok" : "degraded",
          transport: "http",
          authMode: isGatewayMode ? "gateway" : "env",
          timestamp: new Date().toISOString(),
          credentials: {
            configured: !!creds,
          },
          logLevel: process.env.LOG_LEVEL || "info",
          version: "1.0.0",
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // Gateway mode: extract credentials from headers
      if (isGatewayMode) {
        const clientId = req.headers["x-checkpoint-client-id"] as string | undefined;
        const clientSecret = req.headers["x-checkpoint-client-secret"] as string | undefined;

        if (!clientId || !clientSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing credentials",
              message:
                "Gateway mode requires X-Checkpoint-Client-Id and X-Checkpoint-Client-Secret headers",
              required: ["X-Checkpoint-Client-Id", "X-Checkpoint-Client-Secret"],
            })
          );
          return;
        }

        // Set env vars so getCredentials() picks them up
        process.env.CHECKPOINT_CLIENT_ID = clientId;
        process.env.CHECKPOINT_CLIENT_SECRET = clientSecret;
      }

      transport.handleRequest(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }));
  });

  await server.connect(transport);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(`Checkpoint Harmony MCP server listening on http://${host}:${port}/mcp`);
      logger.info(`Health check available at http://${host}:${port}/health`);
      logger.info(
        `Authentication mode: ${isGatewayMode ? "gateway (header-based)" : "env (CHECKPOINT_CLIENT_ID/CHECKPOINT_CLIENT_SECRET environment variables)"}`
      );
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down Checkpoint Harmony MCP server...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Main entry point - select transport based on MCP_TRANSPORT env var
 */
async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";
  logger.info("Starting Checkpoint Harmony MCP server", {
    transport: transportType,
    logLevel: process.env.LOG_LEVEL || "info",
    nodeVersion: process.version,
  });

  if (transportType === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
