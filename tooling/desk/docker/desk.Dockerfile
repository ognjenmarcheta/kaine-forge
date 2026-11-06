# Agent Desk worker image. Built by `pnpm desk docker build`, which stages this
# file with the desk-*.mjs scripts and the receipt hook into a small build
# context and passes the pinned versions as build arguments. The image tag is a
# hash of all of that, so any change gives a new tag.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ARG PNPM_VERSION
ARG CLAUDE_VERSION
ARG CODEX_VERSION
ARG OPENCODE_VERSION
ARG OPENCODE_SHA256_AMD64
ARG OPENCODE_SHA256_ARM64
ENV COREPACK_HOME=/opt/corepack
# OpenCode ships as one binary per platform. It downloads ripgrep when `rg` is missing,
# which the container cannot do, so the image installs ripgrep.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates procps python3 make g++ curl ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && npm install -g @anthropic-ai/claude-code@${CLAUDE_VERSION} @openai/codex@${CODEX_VERSION} \
    && chmod -R a+rX /opt/corepack \
    && arch="$(dpkg --print-architecture)" \
    && case "${arch}" in \
         amd64) asset=x64; sum="${OPENCODE_SHA256_AMD64}" ;; \
         arm64) asset=arm64; sum="${OPENCODE_SHA256_ARM64}" ;; \
         *) echo "no OpenCode build for ${arch}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/opencode.tar.gz \
         "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-${asset}.tar.gz" \
    && echo "${sum}  /tmp/opencode.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode \
    && rm /tmp/opencode.tar.gz \
    && chmod 0755 /usr/local/bin/opencode
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
