# hindenrank-mcp

MCP server for [Hindenrank](https://hindenrank.com) DeFi risk ratings. Check protocol risk grades from Claude, Cursor, or any MCP-compatible client.

## Quick Start

Add to your Claude Code or Cursor MCP config:

```json
{
  "mcpServers": {
    "hindenrank": {
      "command": "npx",
      "args": ["-y", "hindenrank-mcp"],
      "env": {
        "HINDENRANK_API_KEY": "your-key-here"
      }
    }
  }
}
```

The API key is optional. Without one, you get basic risk grades (500 requests/day). With a free key, you get value grades and filtering (2,000/day). Pro keys unlock full protocol data (50,000/day).

Get your API key at [hindenrank.com/account](https://hindenrank.com/account).

## Tools

### `get_protocol_risk`

Look up the risk grade, top risks, and verdict for a protocol.

```
> "Is Aave safe to deposit into?"

Aave V3 (aave-v3)
Risk Grade: A- (14/100 — lower is safer)
TVL: $12.5B
Sector: Lending
Last Scanned: 2026-02-20

Top Risks:
  - Oracle dependency on Chainlink price feeds
  - Governance concentration in large token holders

Verdict: Well-established lending protocol with strong track record...
```

### `search_protocols`

Find protocols by name when you don't know the exact slug.

```
> "Find lending protocols"

Found 8 protocol(s) matching "lending":
- Aave V3 (aave-v3) — Grade: A- (14/100) | TVL: $12.5B
- Compound V3 (compound-v3) — Grade: B+ (22/100) | TVL: $2.1B
...
```

### `list_protocols`

List protocols with optional sector and grade filters.

```
> "Show me the safest DEX protocols"

Showing 5 of 42 protocols:
- Uniswap V3 — Grade: A (8/100) | TVL: $4.2B | DEX
- Curve Finance — Grade: A- (12/100) | TVL: $1.8B | DEX
...
```

### `compare_protocols`

Compare 2-5 protocols side by side. Requires an API key (free tier is fine).

```
> "Compare Aave, Compound, and Morpho"

Protocol Comparison
═══════════════════

Aave V3 ✦ SAFEST
  Risk: A- (14/100) | TVL: $12.5B
  Key risks: oracle dependency, governance concentration

Compound V3
  Risk: B+ (22/100) | TVL: $2.1B
  Key risks: oracle dependency, liquidation cascades

Morpho Blue ⚠ RISKIEST
  Risk: B (28/100) | TVL: $890M
  Key risks: novel vault architecture, oracle dependency

Summary:
  Safest: Aave V3
  Riskiest: Morpho Blue
  Best Value: Morpho Blue
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HINDENRANK_API_KEY` | No | API key for higher rate limits and more data |
| `HINDENRANK_BASE_URL` | No | Override API base URL (default: `https://hindenrank.com/api/v1`) |

## API Documentation

Full API docs: [hindenrank.com/developers](https://hindenrank.com/developers)

## License

MIT
