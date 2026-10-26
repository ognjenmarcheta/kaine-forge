import { appendFileSync, readFileSync } from "node:fs";
import console from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DOCKER_APPS = [
  { app: "api", dockerfile: "Dockerfile.api", workspace: "@repo/api" },
  { app: "web", dockerfile: "Dockerfile.web", workspace: "@repo/web" }
];

/**
 * Decide which heavy PR jobs run from `turbo ls --affected` output. `force` is set
 * for non-PR events and for changed files outside the package graph; `docker` is
 * the Docker input path filter that docker-cache.yml mirrors.
 */
export function affectedJobs({ packages, force, docker }) {
  const names = new Set(packages.map((pkg) => pkg.name));
  const touches = (...workspaces) => force || workspaces.some((name) => names.has(name));
  return {
    // Coverage projects are every app and package; tooling/* and the e2e suite are not.
    unit: force || packages.some(({ path }) => !path.startsWith("tooling/") && path !== "apps/e2e"),
    webApi: touches("@repo/api", "@repo/web", "@repo/e2e"),
    mobile: touches("@repo/mobile", "@repo/mobile-ui"),
    dockerMatrix: docker
      ? DOCKER_APPS.filter(({ workspace }) => touches(workspace)).map(({ app, dockerfile }) => ({
          app,
          dockerfile
        }))
      : []
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const force = process.env.FORCE === "true";
    const affected = force ? [] : JSON.parse(readFileSync(process.argv[2], "utf8")).packages.items;
    if (!Array.isArray(affected)) throw new Error("packages.items is not an array");
    const jobs = affectedJobs({ packages: affected, force, docker: process.env.DOCKER === "true" });
    const lines = [
      `unit=${jobs.unit}`,
      `web_api=${jobs.webApi}`,
      `mobile=${jobs.mobile}`,
      `docker_matrix=${JSON.stringify(jobs.dockerMatrix)}`
    ];
    console.log(
      force
        ? "Forced: every job runs."
        : `Affected: ${affected.map((pkg) => pkg.name).join(", ") || "none"}`
    );
    console.log(lines.join("\n"));
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  } catch (error) {
    console.error(
      `Invalid affected package input: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  }
}
