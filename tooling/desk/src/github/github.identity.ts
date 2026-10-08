import type { GitHubPort } from "../ports";
import type { RepositoryInfo } from "./github.types";

export type ControllerIdentity =
  | { readonly ok: true; readonly owner: string; readonly repository: RepositoryInfo }
  | { readonly ok: false; readonly reason: string };

/**
 * The factory's controller check, as a pure function. `gh` must authenticate
 * as the repository owner. For a repository outside a personal account the
 * owner cannot be derived, so it must be configured. Case does not matter.
 */
export const evaluateControllerIdentity = (
  repository: RepositoryInfo,
  viewer: string,
  configuredOwner: string | undefined
): ControllerIdentity => {
  let owner = configuredOwner;
  if (owner === undefined) {
    if (repository.ownerType !== "User") {
      return {
        ok: false,
        reason: `${repository.fullName} belongs to ${repository.ownerLogin}, which is not a personal account. Set "owner" in .ai.local/desk/config.json.`
      };
    }
    owner = repository.ownerLogin;
  }
  if (viewer.toLowerCase() !== owner.toLowerCase()) {
    return {
      ok: false,
      reason: `gh is signed in as ${viewer}, but the owner is ${owner}. Run \`gh auth login\` as the owner.`
    };
  }
  return { ok: true, owner, repository };
};

export const checkControllerIdentity = async (
  github: Pick<GitHubPort, "repository" | "viewer">,
  configuredOwner: string | undefined
): Promise<ControllerIdentity> =>
  evaluateControllerIdentity(await github.repository(), await github.viewer(), configuredOwner);
