#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HindenrankClient } from "./client.js";
import { createToolHandlers, TOOL_DEFINITIONS } from "./tools.js";

const client = new HindenrankClient({
  apiKey: process.env.HINDENRANK_API_KEY,
  baseUrl: process.env.HINDENRANK_BASE_URL,
});

const handlers = createToolHandlers(client);

const server = new McpServer({
  name: "hindenrank",
  version: "0.1.0",
});

// Register tools
server.tool(
  "get_protocol_risk",
  TOOL_DEFINITIONS[0].description,
  { name: z.string().describe("Protocol name or slug") },
  async (args) => ({
    content: [{ type: "text", text: await handlers.get_protocol_risk(args) }],
  }),
);

server.tool(
  "search_protocols",
  TOOL_DEFINITIONS[1].description,
  {
    query: z.string().min(2).describe("Search query"),
    limit: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => ({
    content: [{ type: "text", text: await handlers.search_protocols(args) }],
  }),
);

server.tool(
  "list_protocols",
  TOOL_DEFINITIONS[2].description,
  {
    sector: z.string().optional().describe("Filter by sector"),
    min_grade: z.string().optional().describe("Minimum risk grade"),
    max_grade: z.string().optional().describe("Maximum risk grade"),
    limit: z.number().optional().describe("Max results (default 20)"),
  },
  async (args) => ({
    content: [{ type: "text", text: await handlers.list_protocols(args) }],
  }),
);

server.tool(
  "compare_protocols",
  TOOL_DEFINITIONS[3].description,
  {
    protocols: z.array(z.string()).min(2).max(5).describe("Protocol names or slugs to compare"),
  },
  async (args) => ({
    content: [{ type: "text", text: await handlers.compare_protocols(args) }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
