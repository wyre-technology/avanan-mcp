# Multi-stage build for efficient container size
FROM node:22-alpine AS builder

ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

WORKDIR /app

COPY package*.json ./

RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

# Production stage
FROM node:22-alpine AS production

RUN addgroup -g 1001 -S avanan && \
    adduser -S avanan -u 1001 -G avanan

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

RUN npm prune --omit=dev && npm cache clean --force

RUN mkdir -p /app/logs && chown -R avanan:avanan /app

USER avanan

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
# Set to 'gateway' for hosted deployment where the MCP gateway injects credentials
ENV AUTH_MODE=gateway

VOLUME ["/app/logs"]

CMD ["node", "dist/index.js"]

ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="Checkpoint Harmony Email & Collaboration (Avanan) MCP Server"
LABEL org.opencontainers.image.title="mcp-server-checkpoint-avanan"
LABEL org.opencontainers.image.description="Model Context Protocol server for Checkpoint Harmony Email & Collaboration (Avanan) email security integration"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/mcp-server-checkpoint-avanan"
LABEL org.opencontainers.image.documentation="https://github.com/wyre-technology/mcp-server-checkpoint-avanan/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/wyre-technology/mcp-server-checkpoint-avanan/pkgs/container/mcp-server-checkpoint-avanan"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/avanan-mcp"
