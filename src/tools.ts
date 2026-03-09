import { HindenrankClient, BasicProtocol, BasicVault } from "./client.js";

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

function formatVault(vault: BasicVault): string {
  const parts = [
    `${vault.name} (${vault.vaultId})`,
    `Source: ${vault.source} | Chain: ${vault.chain}`,
  ];

  if (vault.riskGrade) {
    parts.push(`Risk Grade: ${vault.riskGrade} (${vault.riskScore}/100 — lower is safer)`);
  } else {
    parts.push("Risk Grade: Unrated");
  }

  if (vault.tvl !== null) parts.push(`TVL: $${formatNumber(vault.tvl)}`);
  if (vault.apy !== null) parts.push(`APY: ${(vault.apy * 100).toFixed(2)}%`);

  if (vault.assets.length > 0) {
    parts.push(`Assets: ${vault.assets.join(", ")}`);
  }

  if (vault.protocolSlugs.length > 0) {
    parts.push(`Underlying Protocols: ${vault.protocolSlugs.join(", ")}`);
  }

  // Include performance metrics if available (free+ tier)
  if ("cumulativeReturn" in vault && vault.cumulativeReturn !== null) {
    parts.push(`Cumulative Return: ${((vault.cumulativeReturn as number) * 100).toFixed(2)}%`);
  }
  if ("maxDrawdown" in vault && vault.maxDrawdown !== null) {
    parts.push(`Max Drawdown: ${((vault.maxDrawdown as number) * 100).toFixed(2)}%`);
  }
  if ("sharpeRatio" in vault && vault.sharpeRatio !== null) {
    parts.push(`Sharpe Ratio: ${(vault.sharpeRatio as number).toFixed(2)}`);
  }
  if ("effectiveLeverage" in vault && vault.effectiveLeverage !== null) {
    parts.push(`Effective Leverage: ${(vault.effectiveLeverage as number).toFixed(2)}x`);
  }

  return parts.join("\n");
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

    get_vault_risk: async (args: { vault_id: string }) => {
      try {
        const result = await client.getVault(args.vault_id);
        return formatVault(result.data);
      } catch {
        // Try searching by name
        const searchResult = await client.searchVaults(args.vault_id, 1);
        if (searchResult.data.length === 0) {
          return `No vault found matching "${args.vault_id}". Try searching with search_vaults.`;
        }
        const found = searchResult.data[0];
        const detail = await client.getVault(found.vaultId);
        return formatVault(detail.data);
      }
    },

    search_vaults: async (args: { query: string; limit?: number }) => {
      const result = await client.searchVaults(args.query, args.limit ?? 10);
      if (result.data.length === 0) {
        return `No vaults found matching "${args.query}".`;
      }

      const lines = [`Found ${result.data.length} vault(s) matching "${args.query}":\n`];
      for (const v of result.data) {
        const grade = v.riskGrade ? `Grade: ${v.riskGrade} (${v.riskScore}/100)` : "Unrated";
        const tvl = v.tvl !== null ? ` | TVL: $${formatNumber(v.tvl)}` : "";
        const apy = v.apy !== null ? ` | APY: ${(v.apy * 100).toFixed(2)}%` : "";
        lines.push(`- ${v.name} (${v.source}/${v.chain}) — ${grade}${tvl}${apy}`);
      }
      return lines.join("\n");
    },

    list_vaults: async (args: {
      source?: string;
      chain?: string;
      strategy?: string;
      min_grade?: string;
      max_grade?: string;
      rated?: boolean;
      limit?: number;
    }) => {
      const result = await client.listVaults({
        source: args.source,
        chain: args.chain,
        strategy: args.strategy,
        minGrade: args.min_grade,
        maxGrade: args.max_grade,
        rated: args.rated,
        limit: args.limit ?? 20,
      });

      if (result.data.length === 0) {
        return "No vaults match the given filters.";
      }

      const meta = result.meta as { total?: number };
      const lines = [`Showing ${result.data.length} of ${meta.total ?? "?"} vaults:\n`];
      for (const v of result.data) {
        const grade = v.riskGrade ? `Grade: ${v.riskGrade} (${v.riskScore}/100)` : "Unrated";
        const tvl = v.tvl !== null ? ` | TVL: $${formatNumber(v.tvl)}` : "";
        const apy = v.apy !== null ? ` | APY: ${(v.apy * 100).toFixed(2)}%` : "";
        lines.push(`- ${v.name} — ${grade}${tvl}${apy} | ${v.source}/${v.chain}`);
      }
      return lines.join("\n");
    },

    get_vault_correlations: async () => {
      const result = await client.getVaultCorrelations();
      const d = result.data;
      const lines = [
        `Vault Correlation Matrix (${d.vaultCount} vaults, ${d.windowDays}-day window)`,
        `Computed: ${d.computedAt}`,
      ];
      if (d.diversificationAll !== null) {
        lines.push(`Overall Diversification Score: ${d.diversificationAll.toFixed(1)}/100`);
      }
      lines.push("");
      lines.push(`Vault IDs: ${d.vaultIds.join(", ")}`);
      lines.push("");
      lines.push("Pairwise correlations (showing |r| > 0.3):");
      for (const id1 of d.vaultIds) {
        for (const id2 of d.vaultIds) {
          if (id1 >= id2) continue;
          const r = d.matrix[id1]?.[id2];
          if (r !== undefined && Math.abs(r) > 0.3) {
            lines.push(`  ${id1} ↔ ${id2}: ${r.toFixed(3)}`);
          }
        }
      }
      return lines.join("\n");
    },

    get_diversification_score: async (args: { vault_ids: string[] }) => {
      const result = await client.getDiversificationScore(args.vault_ids);
      const d = result.data;
      const lines = [
        `Diversification Score for ${d.vaultIds.length} vaults`,
        `Vaults: ${d.vaultIds.join(", ")}`,
      ];
      if (d.diversificationScore !== null) {
        lines.push(`Score: ${d.diversificationScore.toFixed(1)}/100 (higher = more diversified)`);
      } else {
        lines.push("Score: N/A (insufficient data)");
      }
      lines.push(`Computed: ${d.computedAt}`);
      return lines.join("\n");
    },

    get_model_portfolio: async (args: {
      max_vaults?: number;
      min_sharpe?: number;
      max_correlation?: number;
      strategies?: string;
      realtime?: boolean;
    }) => {
      const result = await client.getModelPortfolio({
        maxVaults: args.max_vaults,
        minSharpe: args.min_sharpe,
        maxCorrelation: args.max_correlation,
        strategies: args.strategies,
        realtime: args.realtime,
      });
      const d = result.data;
      const lines = [
        `Model Portfolio (${d.portfolio.length} vaults)`,
      ];
      if (d.diversificationScore !== null) {
        lines.push(`Portfolio Diversification: ${d.diversificationScore.toFixed(1)}/100`);
      }
      lines.push(`Computed: ${d.computedAt}`);
      lines.push("");
      for (const entry of d.portfolio) {
        const strategy = entry.strategyType ? ` [${entry.strategyType}]` : "";
        const sharpe = entry.sharpeRatio !== null ? ` | Sharpe: ${entry.sharpeRatio.toFixed(2)}` : "";
        const grade = entry.riskGrade ? ` | Risk: ${entry.riskGrade}` : "";
        lines.push(`- ${entry.name}${strategy} — Weight: ${(entry.weight * 100).toFixed(1)}%${sharpe}${grade}`);
      }
      return lines.join("\n");
    },
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: "get_protocol_risk",
    description:
      "Look up the risk grade, top risks, and verdict for a crypto protocol. " +
      "Accepts protocol name or slug (e.g., 'Aave', 'uniswap-v3'). " +
      "Use this before interacting with any crypto protocol to check its safety.",
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
      "Search for crypto protocols by name. Returns matching protocols with their risk grades. " +
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
      "List crypto protocols with optional filters. Filter by sector (e.g., 'Lending', 'DEX') " +
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
      "Compare 2-5 crypto protocols side by side. Shows risk grades, key risks, " +
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
  {
    name: "get_vault_risk",
    description:
      "Look up the risk grade for a DeFi vault (Beefy, Hyperliquid, or Morpho). " +
      "Returns risk score, APY, TVL, underlying protocols, and performance metrics. " +
      "Use this to check vault safety before depositing. Accepts vault ID or name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vault_id: {
          type: "string",
          description: "Vault ID or name (e.g., 'hl-0x1234...', 'HYPE Maxi')",
        },
      },
      required: ["vault_id"],
    },
  },
  {
    name: "search_vaults",
    description:
      "Search for DeFi vaults by name or asset. Returns matching vaults with risk grades, " +
      "APY, and TVL. Searches across Beefy, Hyperliquid, and Morpho vaults.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query — vault name or asset (e.g., 'ETH', 'HYPE', 'aave')",
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
    name: "list_vaults",
    description:
      "List DeFi vault risk ratings with optional filters. Filter by source (beefy, hyperliquid, morpho), " +
      "chain, or grade range. Use rated=true to only show graded vaults. " +
      "Essential for building vault-of-vaults strategies or screening vault risk.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Filter by source: beefy, hyperliquid, or morpho",
        },
        chain: {
          type: "string",
          description: "Filter by chain: ethereum, arbitrum, base, etc.",
        },
        strategy: {
          type: "string",
          description: "Filter by strategy type (e.g., 'delta-neutral', 'momentum', 'basis')",
        },
        min_grade: {
          type: "string",
          description: "Minimum risk grade (e.g., 'C' to only show C or riskier)",
        },
        max_grade: {
          type: "string",
          description: "Maximum risk grade (e.g., 'B' to only show B or safer)",
        },
        rated: {
          type: "boolean",
          description: "Set to true to only return vaults with risk grades",
        },
        limit: {
          type: "number",
          description: "Maximum results (default 20)",
        },
      },
    },
  },
  {
    name: "get_vault_correlations",
    description:
      "Get the pairwise return correlation matrix across all rated Hyperliquid vaults. Requires Pro API key.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_diversification_score",
    description:
      "Calculate a diversification score (0-100) for a basket of vault IDs. Higher = more diversified.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vault_ids: {
          type: "array",
          items: { type: "string" },
          description: "Vault IDs to calculate diversification for (minimum 2)",
          minItems: 2,
        },
      },
      required: ["vault_ids"],
    },
  },
  {
    name: "get_model_portfolio",
    description:
      "Get the recommended model portfolio allocation across Hyperliquid vaults for a Vault-of-Vaults strategy. Requires Pro API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        max_vaults: {
          type: "number",
          description: "Maximum number of vaults in the portfolio",
        },
        min_sharpe: {
          type: "number",
          description: "Minimum Sharpe ratio threshold for inclusion",
        },
        max_correlation: {
          type: "number",
          description: "Maximum pairwise correlation allowed (0-1)",
        },
        strategies: {
          type: "string",
          description: "Comma-separated strategy types to include (e.g., 'delta-neutral,momentum')",
        },
        realtime: {
          type: "boolean",
          description: "Use realtime data instead of cached (slower but fresher)",
        },
      },
    },
  },
];
