# 1.0.0 (2026-04-07)


### Bug Fixes

* align package name to avanan-mcp convention ([a997b3b](https://github.com/wyre-technology/avanan-mcp/commit/a997b3bcf939d8f13959ba59b9f5da05668164d9))


### Features

* initial scaffold with lazy loading meta-tools support ([eda4480](https://github.com/wyre-technology/avanan-mcp/commit/eda4480f0d962093a35a658915d0c885da6051eb))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-10

### Added
- Lazy loading meta-tools mode as an alternative to decision-tree navigation
  - Enabled via `LAZY_LOADING=true` environment variable
  - `avanan_list_categories`: List all tool categories with descriptions and tool counts
  - `avanan_list_category_tools`: List full tool schemas for a given category
  - `avanan_execute_tool`: Execute any domain tool by name without navigating first
  - `avanan_router`: Natural-language intent routing that suggests the best tool(s)
- New `src/utils/categories.ts` module defining TOOL_CATEGORIES constant and helper functions

## [1.0.0] - 2026-03-10

### Added
- Initial release of Checkpoint Harmony Email & Collaboration (Avanan) MCP Server
- Decision-tree navigation architecture with nine domains:
  - `quarantine`: List, get details, release, and delete quarantined emails
  - `threats`: List threats, get threat details, IOCs, and threat timelines
  - `events`: List security events, get event details, and list active alerts
  - `policies`: List, get details, and enable/disable security policies (DLP, anti-phishing, anti-malware)
  - `users`: List users, get user details, and view user threat history
  - `reports`: Threat summary, email flow statistics, and protection effectiveness reports
  - `incidents`: List, get details, update status, and add notes to security incidents
  - `banners`: List, get details, and update Smart Banner configurations
  - `saas`: List SaaS applications, get protection status, and view security summaries
- OAuth2 client credentials authentication with automatic token refresh
- Dual transport support: stdio (Claude Desktop) and HTTP streaming (hosted deployment)
- Gateway auth mode: credentials injected via `X-Checkpoint-Client-Id` and `X-Checkpoint-Client-Secret` headers
- Health check endpoint at `/health`
- Docker image with non-root user and health check
- Structured stderr-only logging with configurable log level
- Elicitation support for interactive filtering and destructive action confirmation
- Comprehensive test suite with vitest
- MCPB manifest for Claude Desktop installation
