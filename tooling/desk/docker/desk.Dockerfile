# Agent Desk worker image. Built by `pnpm desk docker build`, which stages this
# file with the desk-*.mjs scripts and the receipt hook into a small build
# context and passes the pinned versions as build arguments. The image tag is a
# hash of all of that, so any change gives a new tag.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ARG PNPM_VERSION
ARG CLAUDE_VERSION
ARG CODEX_VERSION
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && npm install -g @anthropic-ai/claude-code@${CLAUDE_VERSION} @openai/codex@${CODEX_VERSION} \
    && chmod -R a+rX /opt/corepack
COPY desk-auth.mjs desk-bridge.mjs desk-entry.mjs desk-fetch.mjs desk-probe.mjs desk-proxy.mjs desk-workspace.mjs receipt.mjs /opt/desk/
# Mount points. Docker copies their owner into a new named volume, so the unprivileged
# user owns the volumes and no container needs root to prepare them.
RUN mkdir -p /workspace /state /store /socket /auth /home/desk /desk/in \
    && chown -R 1000:1000 /workspace /state /store /socket /auth /home/desk /desk
ENV HOME=/home/desk \
    DO_NOT_TRACK=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    NO_UPDATE_NOTIFIER=1 \
    npm_config_update_notifier=false
USER 1000:1000
WORKDIR /workspace
