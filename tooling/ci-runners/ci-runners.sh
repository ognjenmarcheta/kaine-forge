#!/usr/bin/env bash
# ARC self-hosted runners on one Linux workstation (docs/self-hosted-ci.md).
#   ci-runners.sh bootstrap                       install or update the host (asks for sudo)
#   ci-runners.sh add-repo owner/repo [max-runners]  install or update one repo's scale set
# Run as your normal user. Both commands are safe to re-run.
set -euo pipefail

K3S_VERSION="v1.36.5+k3s1"
HELM_VERSION="v3.22.0"
HELM_SHA256="1e4ab49e429626cf6c6958d914248b78c9730803c2751b87627e171dc800e7bb"
ARC_VERSION="0.15.0"
ARC_CHARTS="oci://ghcr.io/actions/actions-runner-controller-charts"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-arc.yaml}"

die() {
  echo "error: $*" >&2
  exit 1
}

bootstrap() {
  [ "$(uname -sm)" = "Linux x86_64" ] || die "Linux x86_64 only"
  command -v docker >/dev/null || die "Docker Engine is required to build the runner image"

  if ! cmp -s "$here/k3s-config.yaml" /etc/rancher/k3s/config.yaml; then
    sudo install -D -m 644 "$here/k3s-config.yaml" /etc/rancher/k3s/config.yaml
    k3s_config_changed=1
  fi
  if [ "$(k3s --version 2>/dev/null | awk 'NR == 1 { print $3 }')" != "$K3S_VERSION" ]; then
    curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION="$K3S_VERSION" sh -
  elif [ -n "${k3s_config_changed:-}" ]; then
    sudo systemctl restart k3s
  fi

  # k3s documents these rules for hosts with ufw: pods and services must reach
  # the API server and DNS on the host.
  if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
    sudo ufw allow from 10.42.0.0/16 to any comment "k3s pods"
    sudo ufw allow from 10.43.0.0/16 to any comment "k3s services"
  fi

  mkdir -p "$(dirname "$KUBECONFIG")"
  sudo install -m 600 -o "$(id -u)" -g "$(id -g)" /etc/rancher/k3s/k3s.yaml "$KUBECONFIG"
  kubectl wait --for=condition=Ready node --all --timeout=180s

  if [ "$(helm version --template '{{.Version}}' 2>/dev/null)" != "$HELM_VERSION" ]; then
    tmp="$(mktemp -d)"
    curl -fsSLo "$tmp/helm.tgz" "https://get.helm.sh/helm-$HELM_VERSION-linux-amd64.tar.gz"
    echo "$HELM_SHA256  $tmp/helm.tgz" | sha256sum -c -
    tar -xzf "$tmp/helm.tgz" -C "$tmp"
    sudo install -m 755 "$tmp/linux-amd64/helm" /usr/local/bin/helm
    rm -rf "$tmp"
  fi

  # Pods use imagePullPolicy: Never, so new jobs pick up a rebuilt image at once.
  docker build -t kaine-ci-runner:local -f "$here/runner.Dockerfile" "$here"
  docker save kaine-ci-runner:local | sudo k3s ctr images import -

  kubectl apply -f "$here/cluster.yaml"
  helm upgrade --install arc "$ARC_CHARTS/gha-runner-scale-set-controller" \
    --version "$ARC_VERSION" --namespace arc-systems --create-namespace --wait

  # Heartbeat and shutdown hook run as root from a root-owned copy, not from
  # this user-writable checkout.
  [ -x /usr/bin/node ] || sudo apt-get install -y nodejs
  sudo install -D -m 644 "$here/../../scripts/ci-runners.mjs" /usr/local/lib/ci-runners/ci-runners.mjs
  sudo install -m 644 "$here/ci-runners-heartbeat.service" "$here/ci-runners-heartbeat.timer" \
    "$here/ci-runners-offline.service" /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now ci-runners-heartbeat.timer ci-runners-offline.service

  echo "Host ready. Next: create the arc-github-app secret, then run: $0 add-repo owner/repo"
}

add_repo() {
  local repo="${1:-}" max="${2:-4}" name
  [[ "$repo" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || die "usage: $0 add-repo owner/repo [max-runners]"
  [[ "$max" =~ ^[1-9][0-9]*$ ]] || die "max-runners must be a positive integer"
  kubectl get secret arc-github-app --namespace arc-runners >/dev/null ||
    die "create the arc-github-app secret first (docs/self-hosted-ci.md)"
  name="$(tr '[:upper:]._' '[:lower:]--' <<<"${repo#*/}")"
  helm upgrade --install "$name" "$ARC_CHARTS/gha-runner-scale-set" \
    --version "$ARC_VERSION" --namespace arc-runners \
    --values "$here/scale-set.values.yaml" \
    --set githubConfigUrl="https://github.com/$repo" \
    --set-json maxRunners="$max" --wait
  sudo systemctl start ci-runners-heartbeat.service
  echo "$repo: scale set '$name' installed; heartbeat sent. Check Settings → Actions → Runners."
}

case "${1:-}" in
  bootstrap) bootstrap ;;
  add-repo) add_repo "${@:2}" ;;
  *) die "usage: $0 bootstrap | add-repo owner/repo [max-runners]" ;;
esac
