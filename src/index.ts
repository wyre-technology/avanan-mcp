#!/usr/bin/env node
/**
 * Checkpoint Harmony Email & Collaboration MCP Server
 *
 * Implements the HEC Smart API v1.50.
 *
 * Transports:
 *   - stdio (default): For local Claude Desktop / CLI usage
 *   - http: For hosted deployment via MCP gateway
 *
 * Auth modes:
 *   - env (default): Credentials from CHECKPOINT_CLIENT_ID and CHECKPOINT_CLIENT_SECRET
 *   - gateway: Credentials injected from X-Checkpoint-Client-Id / X-Checkpoint-Client-Secret headers
 *
 * Regional base URL is auto-detected from the JWT region claim (eu/us/au/in).
 * Override with CHECKPOINT_REGION env var.
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./utils/logger.js";
import { getCredentials } from "./utils/client.js";
import { credentialStore } from "./utils/credential-store.js";
import { eventTools, handleEventTool } from "./tools/events.js";
import { searchTools, handleSearchTool } from "./tools/search.js";
import { actionTools, handleActionTool } from "./tools/actions.js";
import { exceptionTools, handleExceptionTool } from "./tools/exceptions.js";
import type { CallToolResult } from "./utils/types.js";

const ALL_TOOLS = [...eventTools, ...searchTools, ...actionTools, ...exceptionTools];

// Pre-built map for O(1) tool dispatch instead of repeated Array.some() per request
type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
const TOOL_HANDLERS = new Map<string, ToolHandler>([
  ...eventTools.map((t) => [t.name, handleEventTool] as [string, ToolHandler]),
  ...searchTools.map((t) => [t.name, handleSearchTool] as [string, ToolHandler]),
  ...actionTools.map((t) => [t.name, handleActionTool] as [string, ToolHandler]),
  ...exceptionTools.map((t) => [t.name, handleExceptionTool] as [string, ToolHandler]),
]);

/**
 * Create a fresh MCP server instance with all handlers registered.
 * Called once for stdio, or per-request for HTTP transport.
 */
function createMcpServer(): Server {
  const server = new Server(
    { name: "mcp-server-checkpoint-harmony-email", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    logger.info("Tool call", { tool: name });

    try {
      const toolArgs = args as Record<string, unknown>;
      const handler = TOOL_HANDLERS.get(name);

      if (!handler) {
        return {
          content: [{ type: "text", text: `Unknown tool: '${name}'` }],
          isError: true,
        };
      }

      return await handler(name, toolArgs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Tool call failed", { tool: name, error: message });
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Checkpoint Harmony Email MCP running on stdio");
}

async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      const creds = getCredentials();
      res.writeHead(creds ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: creds ? "ok" : "degraded",
          transport: "http",
          authMode: isGatewayMode ? "gateway" : "env",
          version: "2.0.0",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (url.pathname === "/mcp") {
      // Extract per-request credentials from headers (gateway mode).
      // Credentials are stored in AsyncLocalStorage so concurrent
      // requests are isolated — no process.env mutation.
      let gatewayCreds: { clientId: string; clientSecret: string } | null = null;

      if (isGatewayMode) {
        const clientId = req.headers["x-checkpoint-client-id"] as string | undefined;
        const clientSecret = req.headers["x-checkpoint-client-secret"] as string | undefined;

        if (!clientId || !clientSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing credentials",
              required: ["X-Checkpoint-Client-Id", "X-Checkpoint-Client-Secret"],
            })
          );
          return;
        }

        gatewayCreds = { clientId, clientSecret };
      }

      const handleMcp = () => {
        // Create fresh server + transport per request (stateless)
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        res.on("close", () => {
          transport.close();
          server.close();
        });

        server.connect(transport).then(() => {
          transport.handleRequest(req, res);
        });
      };

      if (gatewayCreds) {
        credentialStore.run(gatewayCreds, handleMcp);
      } else {
        handleMcp();
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(`Checkpoint Harmony Email MCP listening on http://${host}:${port}/mcp`);
      logger.info(`Auth mode: ${isGatewayMode ? "gateway" : "env"}`);
      resolve();
    });
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const transport = process.env.MCP_TRANSPORT || "stdio";
  logger.info("Starting Checkpoint Harmony Email MCP", { transport });

  if (transport === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
