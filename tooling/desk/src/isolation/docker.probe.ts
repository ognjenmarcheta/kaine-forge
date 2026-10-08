import { z } from "zod";

import { dockerRunArgs, probeContainer } from "./docker.args";
import { containerBase, parseReply, type DockerContext } from "./docker.context";
import { withProxy } from "./docker.proxy";

/**
 * Isolation probes. A throwaway container starts from the real image with the
 * same hardening flags as an agent container. A script inside it checks what a
 * prompt-injected agent could reach. The probes read no secret value.
 */

const probeSchema = z.object({
  ok: z.boolean(),
  checks: z.array(z.object({ id: z.string(), ok: z.boolean(), detail: z.string() }))
});
export type ProbeReport = z.infer<typeof probeSchema>;

/** Every probe id. The tests and the doctor rely on this list. */
export const PROBE_IDS = [
  "network-interfaces",
  "no-egress",
  "no-credentials-in-env",
  "no-docker-socket",
  "root-filesystem-read-only",
  "non-root",
  "capabilities-empty",
  "no-new-privileges",
  "host-paths-invisible",
  "resource-limits",
  "proxy-allowlist"
] as const;

export interface ProbeOptions {
  /** Host paths that must not exist in the container: the home folder, the worktree. */
  readonly hostPaths: readonly string[];
  /** Mount this proxy socket and test hosts through it. */
  readonly proxy?:
    | {
        readonly socketVolume: string;
        readonly allowed: readonly string[];
        readonly denied: readonly string[];
      }
    | undefined;
}

/** Run the probes once. The script exits 2 when a probe fails; the report is still printed. */
export const runProbe = async (
  context: DockerContext,
  options: ProbeOptions
): Promise<ProbeReport> => {
  const result = await context.docker.run(
    dockerRunArgs(
      probeContainer({
        ...containerBase(context, "probe", context.newId(), context.limits.helper),
        hostPaths: options.hostPaths,
        proxy: options.proxy ?? null
      })
    ),
    { timeoutMs: 120_000 }
  );
  if (result.code !== 0 && result.code !== 2) {
    throw new Error(
      `The probe container did not run (exit ${result.code ?? "none"}): ${result.stderr.trim().slice(-300)}`
    );
  }
  return parseReply(result.stdout, probeSchema, "The probe");
};

/** Hosts the real providers policy must refuse. Asking for them opens no upstream connection. */
export const DENIED_HOSTS = ["example.com", "registry.npmjs.org", "github.com"] as const;

/**
 * The probes the doctor runs: the real providers policy, tested only for refusals,
 * so the doctor never connects to a provider. The positive path is tested with a
 * local proxy in the Docker integration test.
 */
export const runIsolationProbes = (
  context: DockerContext,
  hostPaths: readonly string[]
): Promise<ProbeReport> =>
  withProxy(context, "providers", (socketVolume) =>
    runProbe(context, {
      hostPaths,
      proxy: { socketVolume, allowed: [], denied: DENIED_HOSTS }
    })
  );
