# CodeCausality MCP Adapter

A thin MCP adapter over `@codecausality/core`.

It exposes deterministic repository/change intelligence to MCP hosts without turning CodeCausality into a generic MCP framework. **ForgeMCP remains the Aetherexa project for reusable MCP framework and infrastructure concerns.**

## Tools

- `codecausality_scan_repository`
- `codecausality_impact_file`
- `codecausality_impact_working_tree`
- `codecausality_impact_since`

All tools default to the MCP server process working directory and accept an optional `rootDir`.

Responses are intentionally compact. Evidence lists default to 40 items and report `total` plus `truncated` metadata. Use `maxItems` to request up to 200 items.

## Run locally

```bash
npm install
npm run build -w @codecausality/mcp
node packages/mcp/dist/server.js
```

The server uses stdio. **stdout is reserved for MCP protocol traffic**; operational errors are written to stderr.

## Example host configuration

```json
{
  "mcpServers": {
    "codecausality": {
      "command": "node",
      "args": ["/path/to/CodeCausality/packages/mcp/dist/server.js"],
      "cwd": "/path/to/your/repository"
    }
  }
}
```

Baseline CodeCausality analysis remains local, deterministic, and token-free.
