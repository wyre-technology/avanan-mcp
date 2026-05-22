# Avanan (Check Point) MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for Check Point Avanan (Harmony Email & Collaboration). Enables AI assistants to manage security events, investigate threats, and handle multi-tenant MSP operations across your email security environment.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Check Point Avanan environment.

> **Part of the [MSP Claude Plugins](https://github.com/wyre-technology) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Installation

```bash
npm install @wyre-technology/avanan-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `CHECKPOINT_CLIENT_ID` | Yes | Your Checkpoint/Avanan OAuth2 client ID |
| `CHECKPOINT_CLIENT_SECRET` | Yes | Your Checkpoint/Avanan OAuth2 client secret |
| `CHECKPOINT_REGION` | No | API region (default: us) |
| `MCP_TRANSPORT` | No | Transport mode: stdio (default) or http |

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "avanan-mcp": {
      "command": "npx",
      "args": ["@wyre-technology/avanan-mcp"],
      "env": {
        "CHECKPOINT_CLIENT_ID": "your-checkpoint-client-id"
        "CHECKPOINT_CLIENT_SECRET": "your-checkpoint-client-secret"
      }
    }
  }
}
```

### Running with Claude Code (CLI)

```bash
claude mcp add avanan-mcp \
  -e CHECKPOINT_CLIENT_ID=your-value \
  -e CHECKPOINT_CLIENT_SECRET=your-value \
  -- npx -y @wyre-technology/avanan-mcp
```

### Docker

```bash
docker build -t avanan-mcp .
docker run \
  -e CHECKPOINT_CLIENT_ID=your-value \
  -e CHECKPOINT_CLIENT_SECRET=your-value \
  -p 8080:8080 avanan-mcp
```

## Available Domains

### Events
Security event retrieval and investigation

### Actions
Take action on threats (quarantine, release, etc.)

### Exceptions
Manage email exceptions and allowlists

### Search
Search across email security data


## Development

```bash
# Clone the repository
git clone https://github.com/wyre-technology/avanan-mcp.git
cd avanan-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue to discuss changes.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
