import console from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const QUALITY_JOBS = [
  "detect-paths",
  "changeset-required",
  "dependency-review",
  "check-fast",
  "ai-checks",
  "coverage",
  "mobile-typecheck",
  "mobile-export",
  "graphql-schema",
  "build-core",
  "docker-images",
  "e2e-web-api",
  "e2e-report"
];

/** Evaluate GitHub's job results, including the aggregate result of each matrix. */
export function qualityGateFailures({ eventName, visibility, codeScanningEnabled, needs }) {
  if (!["pull_request", "merge_group", "workflow_dispatch"].includes(eventName)) {
    return ["Unsupported workflow event"];
  }
  if (!["public", "private", "internal"].includes(visibility)) {
    return ["Missing or invalid repository visibility"];
  }
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    return ["Missing job results"];
  }
  const failures = [];
  const pullRequest = eventName === "pull_request";
  const paths = needs["detect-paths"]?.outputs;
  let dockerApps = [];
  if (pullRequest) {
    for (const key of ["unit", "web_api", "mobile", "graphql"]) {
      if (!["true", "false"].includes(paths?.[key])) {
        failures.push(`Missing or invalid path result: ${key}`);
      }
    }
    try {
      dockerApps = JSON.parse(paths?.docker_matrix);
      if (!Array.isArray(dockerApps)) throw new TypeError("not an array");
    } catch {
      failures.push("Missing or invalid path result: docker_matrix");
    }
  }

  const affected = (key) => !pullRequest || paths?.[key] === "true";
  const webApi = affected("web_api");
  const required = {
    "detect-paths": true,
    "changeset-required": pullRequest,
    "dependency-review": pullRequest && (visibility === "public" || codeScanningEnabled === "true"),
    "check-fast": true,
    "ai-checks": true,
    coverage: affected("unit"),
    "mobile-typecheck": affected("mobile"),
    "mobile-export": affected("mobile"),
    "graphql-schema": pullRequest && paths?.graphql === "true",
    "build-core": webApi,
    "docker-images": !pullRequest || dockerApps.length > 0,
    "e2e-web-api": webApi,
    "e2e-report": webApi
  };

  for (const job of QUALITY_JOBS) {
    const result = needs[job]?.result;
    if (result === "success" || (result === "skipped" && !required[job])) continue;
    failures.push(`${job}: ${result ?? "missing"}`);
  }
  for (const job of Object.keys(needs)) {
    if (!QUALITY_JOBS.includes(job)) failures.push(`Unrecognized job: ${job}`);
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const failures = qualityGateFailures({
      eventName: process.env.GITHUB_EVENT_NAME,
      visibility: process.env.REPOSITORY_VISIBILITY,
      codeScanningEnabled: process.env.CODE_SCANNING_ENABLED,
      needs: JSON.parse(process.env.NEEDS_JSON ?? "null")
    });
    for (const failure of failures) console.error(failure);
    if (failures.length === 0)
      console.log("All required PR jobs passed; only permitted skips remain.");
    process.exitCode = failures.length > 0 ? 1 : 0;
  } catch {
    console.error("Invalid PR quality gate input");
    process.exitCode = 1;
  }
}
