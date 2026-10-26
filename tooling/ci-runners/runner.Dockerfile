# Runner image for the ARC scale sets in this folder (docs/self-hosted-ci.md).
# The official image already has passwordless sudo, the Docker CLI with buildx,
# git, curl, unzip, and jq. This adds what the self-hosted prerequisite check in
# .github/actions/setup-node-pnpm still needs: node on PATH and gh, plus zstd so
# actions/cache uses zstd as on hosted runners.
FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS node

FROM ghcr.io/actions/actions-runner:2.338.1@sha256:e275409999c37162649aa050ca573f03eab2eabcb3a1e7fcc47548de6b4f9690

ARG GH_VERSION=2.102.0
ARG GH_SHA256=7e54a307f90afdc59796c325ec0c49fb09e6c18537727207a8ac7513584ea5b0

USER root
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN set -eux; \
    curl -fsSLo /tmp/gh.deb "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.deb"; \
    echo "${GH_SHA256}  /tmp/gh.deb" | sha256sum -c -; \
    apt-get update; \
    apt-get install -y --no-install-recommends zstd /tmp/gh.deb; \
    rm -rf /tmp/gh.deb /var/lib/apt/lists/*; \
    node --version; gh --version
USER runner
