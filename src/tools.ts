import { HindenrankClient, BasicProtocol } from "./client.js";

function formatGrade(protocol: BasicProtocol): string {
  const parts = [
    `${protocol.name} (${protocol.slug})`,
    `Risk Grade: ${protocol.grade} (${protocol.rawScore}/100 — lower is safer)`,
  ];

  if ("valueGrade" in protocol) {
    parts.push(`Value Grade: ${protocol.valueGrade} (${protocol.valueRawScore}/100 — higher is better)`);
  }

  if (protocol.tvl !== null) {
    parts.push(`TVL: $${formatNumber(protocol.tvl)}`);
  }

  parts.push(`Sector: ${protocol.sector}`);
  parts.push(`Last Scanned: ${protocol.lastScanned}`);

  if (protocol.topRisks.length > 0) {
    parts.push("");
    parts.push("Top Risks:");
    for (const risk of protocol.topRisks) {
      parts.push(`  - ${risk}`);
    }
  }

  if (protocol.verdict) {
    parts.push("");
    parts.push(`Verdict: ${protocol.verdict}`);
  }

  return parts.join("\n");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function createToolHandlers(client: HindenrankClient) {
  return {
    get_protocol_risk: async (args: { name: string }) => {
      // Try direct slug lookup first, fall back to search
      const slug = args.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      try {
        const result = await client.getProtocol(slug);
        return formatGrade(result.data);
      } catch {
        // Slug didn't work — try fuzzy search
        const searchResult = await client.searchProtocols(args.name, 1);
        if (searchResult.data.length === 0) {
          return `No protocol found matching "${args.name}". Try a different name or check https://hindenrank.com for the full list.`;
        }
        const found = searchResult.data[0];
        const detail = await client.getProtocol(found.slug);
        return formatGrade(detail.data);
      }
    },

    search_protocols: async (args: { query: string; limit?: number }) => {
      const result = await client.searchProtocols(args.query, args.limit ?? 10);
      if (result.data.length === 0) {
        return `No protocols found matching "${args.query}".`;
      }

      const lines = [`Found ${result.data.length} protocol(s) matching "${args.query}":\n`];
      for (const p of result.data) {
        const tvl = p.tvl !== null ? ` | TVL: $${formatNumber(p.tvl)}` : "";
        lines.push(`- ${p.name} (${p.slug}) — Grade: ${p.grade} (${p.rawScore}/100)${tvl}`);
      }
      return lines.join("\n");
    },

    list_protocols: async (args: { sector?: string; min_grade?: string; max_grade?: string; limit?: number }) => {
      const result = await client.listProtocols({
        sector: args.sector,
        minGrade: args.min_grade,
        maxGrade: args.max_grade,
        limit: args.limit ?? 20,
      });

      if (result.data.length === 0) {
        return "No protocols match the given filters.";
      }

      const meta = result.meta as { total?: number };
      const lines = [`Showing ${result.data.length} of ${meta.total ?? "?"} protocols:\n`];
      for (const p of result.data) {
        const tvl = p.tvl !== null ? ` | TVL: $${formatNumber(p.tvl)}` : "";
        lines.push(`- ${p.name} — Grade: ${p.grade} (${p.rawScore}/100)${tvl} | ${p.sector}`);
      }
      return lines.join("\n");
    },

    compare_protocols: async (args: { protocols: string[] }) => {
      if (args.protocols.length < 2 || args.protocols.length > 5) {
        return "Please provide 2-5 protocol names or slugs to compare.";
      }

      // Resolve names to slugs via search
      const slugs: string[] = [];
      for (const name of args.protocols) {
        const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        try {
          await client.getProtocol(slug);
          slugs.push(slug);
        } catch {
          const search = await client.searchProtocols(name, 1);
          if (search.data.length > 0) {
            slugs.push(search.data[0].slug);
          }
        }
      }

      if (slugs.length < 2) {
        return `Could only find ${slugs.length} of the requested protocols. Make sure the names are correct.`;
      }

      const result = await client.compareProtocols(slugs);
      const { protocols, comparison, notFound } = result.data;

      const lines = ["Protocol Comparison\n", "═══════════════════\n"];

      for (const [slug, p] of Object.entries(protocols)) {
        const marker =
          slug === comparison.safest ? " ✦ SAFEST" :
          slug === comparison.riskiest ? " ⚠ RISKIEST" : "";
        const tvl = p.tvl !== null ? ` | TVL: $${formatNumber(p.tvl)}` : "";
        lines.push(`${p.name}${marker}`);
        lines.push(`  Risk: ${p.grade} (${p.rawScore}/100)${tvl}`);
        if (p.topRisks.length > 0) {
          lines.push(`  Key risks: ${p.topRisks.slice(0, 2).join(", ")}`);
        }
        lines.push("");
      }

      lines.push("Summary:");
      lines.push(`  Safest: ${protocols[comparison.safest]?.name ?? comparison.safest}`);
      lines.push(`  Riskiest: ${protocols[comparison.riskiest]?.name ?? comparison.riskiest}`);
      lines.push(`  Best Value: ${protocols[comparison.bestValue]?.name ?? comparison.bestValue}`);

      if (notFound && notFound.length > 0) {
        lines.push(`\nNot found: ${notFound.join(", ")}`);
      }

      return lines.join("\n");
    },
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: "get_protocol_risk",
    description:
      "Look up the risk grade, top risks, and verdict for a DeFi protocol. " +
      "Accepts protocol name or slug (e.g., 'Aave', 'uniswap-v3'). " +
      "Use this before interacting with any DeFi protocol to check its safety.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Protocol name or slug (e.g., 'Aave V3', 'compound', 'lido')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "search_protocols",
    description:
      "Search for DeFi protocols by name. Returns matching protocols with their risk grades. " +
      "Useful when you don't know the exact protocol name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (min 2 characters)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default 10, max 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_protocols",
    description:
      "List DeFi protocols with optional filters. Filter by sector (e.g., 'Lending', 'DEX') " +
      "or grade range. Returns protocols sorted by risk score (riskiest first).",
    inputSchema: {
      type: "object" as const,
      properties: {
        sector: {
          type: "string",
          description: "Filter by sector: DeFi, L1, L2, Lending, DEX, Stablecoin, Restaking, etc.",
        },
        min_grade: {
          type: "string",
          description: "Minimum risk grade (e.g., 'C' to only show C or riskier)",
        },
        max_grade: {
          type: "string",
          description: "Maximum risk grade (e.g., 'B' to only show B or safer)",
        },
        limit: {
          type: "number",
          description: "Maximum results (default 20)",
        },
      },
    },
  },
  {
    name: "compare_protocols",
    description:
      "Compare 2-5 DeFi protocols side by side. Shows risk grades, key risks, " +
      "and identifies the safest, riskiest, and best value option. " +
      "Requires an API key (free tier or above).",
    inputSchema: {
      type: "object" as const,
      properties: {
        protocols: {
          type: "array",
          items: { type: "string" },
          description: "Protocol names or slugs to compare (2-5)",
          minItems: 2,
          maxItems: 5,
        },
      },
      required: ["protocols"],
    },
  },
];
