import { dockerRunArgs, proxyContainer } from "./docker.args";
import { DockerError } from "./docker.cli";
import { containerBase, type DockerContext } from "./docker.context";
import { allFilters, resourceLabels, runFilter, socketVolume } from "./docker.names";

/**
 * Run `action` while a proxy container serves a unix socket in a fresh volume.
 * Containers with `--network none` reach the proxy through that socket, and the
 * proxy tunnels only the hosts of its policy: the provider hosts (`providers`)
 * or the npm registry (`dependencies`). The proxy container and the socket
 * volume are removed afterwards, and the removal is verified.
 */
export const withProxy = async <T>(
  context: DockerContext,
  mode: "providers" | "dependencies",
  action: (socket: string) => Promise<T>
): Promise<T> => {
  const runId = context.newId();
  const socket = socketVolume(context.owner, runId);
  const base = containerBase(context, "proxy", runId, context.limits.proxy);
  let outcome: { readonly value: T } | { readonly error: unknown };
  try {
    await context.docker.ensureVolume(socket, resourceLabels(context.owner, "sock", runId));
    await context.docker.ok(dockerRunArgs(proxyContainer({ ...base, mode, socketVolume: socket })));
    let ready = false;
    for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
      const probe = await context.docker.run(
        ["exec", base.name, "test", "-S", "/socket/provider.sock"],
        {
          timeoutMs: 15_000
        }
      );
      ready = probe.code === 0;
      if (!ready) await context.sleep(100);
    }
    if (!ready)
      throw new DockerError("The proxy did not open its socket.", ["docker", "exec"], null);
    outcome = { value: await action(socket) };
  } catch (error) {
    outcome = { error };
  }
  try {
    await context.docker.removeContainers([...allFilters(), runFilter(runId)]);
    await context.docker.removeVolumes([...allFilters(), runFilter(runId)]);
  } catch (cleanup) {
    const first = "error" in outcome ? `${describe(outcome.error)}; ` : "";
    throw new DockerError(
      `${first}Proxy cleanup unverified: ${describe(cleanup)}`,
      ["docker", "rm"],
      null
    );
  }
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";
