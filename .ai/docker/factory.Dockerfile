FROM node:22-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ARG CODEX_VERSION=0.154.0
ARG CLAUDE_VERSION=2.1.283
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.29.3 --activate \
    && npm install -g @openai/codex@${CODEX_VERSION} @anthropic-ai/claude-code@${CLAUDE_VERSION} \
    && chmod -R a+rX /opt/corepack
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npm install -g playwright@1.63.0 && playwright install --with-deps chromium \
    && chmod -R a+rX /opt/playwright
COPY .ai/docker/factory-proxy.mjs .ai/docker/factory-worker.mjs .ai/docker/factory-provider.mjs .ai/docker/factory-fetch.mjs /opt/factory/
ENV HOME=/tmp/home CODEX_HOME=/tmp/home/.codex CLAUDE_CONFIG_DIR=/tmp/home/.claude
WORKDIR /tmp/work
USER node
ENTRYPOINT ["node", "/opt/factory/factory-worker.mjs"]
