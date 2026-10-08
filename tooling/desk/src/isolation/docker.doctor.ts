import type { Provider } from "../contracts";
import type { CheckStatus, DoctorCheck } from "../doctor/doctor.checks";
import type { Exec } from "../ports";
import { authVolumePresent } from "./docker.admin";
import type { DockerClient } from "./docker.cli";
import { inspectImage } from "./docker.image";
import type { ProbeReport } from "./docker.probe";

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
        check(
          "docker-image",
          "Docker image",
          missing,
          `${image.tag} is not built. Older images: ${image.present.join(", ")}. Run 'pnpm desk docker build'.`
        )
      );
      break;
    case "missing":
      checks.push(
        check(
          "docker-image",
          "Docker image",
          missing,
          `${image.tag} is not built. Run 'pnpm desk docker build'.`
        )
      );
      break;
    case "unreachable":
      checks.push(check("docker-image", "Docker image", missing, image.detail));
      break;
  }

  for (const provider of PROVIDERS) {
    const present = await authVolumePresent(input.docker, provider);
    checks.push(
      check(
        `docker-auth-${provider}`,
        `Docker login (${provider})`,
        present ? "ok" : "warn",
        present
          ? "the auth volume exists (the desk cannot tell whether the login is still valid)"
          : `no login yet. Run 'pnpm desk docker login --provider ${provider}' before a ${provider} agent runs in Docker.`
      )
    );
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
