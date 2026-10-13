import type { Provider } from "../contracts";
import { authVolumePresent } from "./docker.admin";
import type { DockerClient } from "./docker.cli";
import { inspectImage } from "./docker.image";
import type { ProbeReport } from "./docker.probe";
import { withRemedy, type CheckStatus, type DoctorCheck } from "../doctor/doctor.checks";
import type { Exec } from "../ports";

/**
 * Docker checks for `desk doctor` and `desk docker doctor`. Without Docker in the
 * config, a missing daemon or image is a warning. With it, they are errors.
 */

export interface DockerDoctorInput {
  readonly docker: DockerClient;
  readonly exec: Exec;
  readonly imageTag: string;
  /** `isolation: "docker"` in the config. */
  readonly required: boolean;
  /** Runs the isolation probes. `null` skips them. */
  readonly probe: (() => Promise<ProbeReport>) | null;
}

const check = (id: string, label: string, status: CheckStatus, detail: string): DoctorCheck => ({
  id,
  label,
  status,
  detail
});

const PROVIDERS: readonly Provider[] = ["claude", "codex"];

const BUILD_REMEDY = { command: "pnpm desk docker build", fix: "docker-build" } as const;

export const dockerDoctorChecks = async (input: DockerDoctorInput): Promise<DoctorCheck[]> => {
  const missing: CheckStatus = input.required ? "error" : "warn";
  const daemon = await input.docker.reachable();
  if (!daemon.ok) {
    return [check("docker", "Docker daemon", missing, `not reachable: ${daemon.detail}`)];
  }
  const checks: DoctorCheck[] = [check("docker", "Docker daemon", "ok", "reachable")];

  const image = await inspectImage(input.exec, input.imageTag);
  switch (image.status) {
    case "current":
      checks.push(check("docker-image", "Docker image", "ok", `${image.tag} is current`));
      break;
    case "stale":
      checks.push(
        withRemedy(
          check(
            "docker-image",
            "Docker image",
            missing,
            `${image.tag} is not built. Older images: ${image.present.join(", ")}. Run 'pnpm desk docker build'.`
          ),
          BUILD_REMEDY
        )
      );
      break;
    case "missing":
      checks.push(
        withRemedy(
          check(
            "docker-image",
            "Docker image",
            missing,
            `${image.tag} is not built. Run 'pnpm desk docker build'.`
          ),
          BUILD_REMEDY
        )
      );
      break;
    case "unreachable":
      checks.push(check("docker-image", "Docker image", missing, image.detail));
      break;
  }

  for (const provider of PROVIDERS) {
    const present = await authVolumePresent(input.docker, provider);
    const login = check(
      `docker-auth-${provider}`,
      `Docker login (${provider})`,
      present ? "ok" : "warn",
      present
        ? "the auth volume exists (the desk cannot tell whether the login is still valid)"
        : `no login yet. Run 'pnpm desk docker login --provider ${provider}' before a ${provider} agent runs in Docker.`
    );
    // A login needs the engineer at a terminal, so the desk only offers the command.
    checks.push(withRemedy(login, { command: `pnpm desk docker login --provider ${provider}` }));
  }

  if (input.probe !== null && image.status === "current") {
    try {
      const report = await input.probe();
      for (const entry of report.checks) {
        checks.push(
          check(
            `docker-probe-${entry.id}`,
            `Isolation: ${entry.id}`,
            entry.ok ? "ok" : "error",
            entry.detail
          )
        );
      }
    } catch (error) {
      checks.push(
        check(
          "docker-probe",
          "Isolation probes",
          "error",
          error instanceof Error ? error.message : "the probes failed"
        )
      );
    }
  }
  return checks;
};
