import { describe, expect, it } from "vitest";

import { checkControllerIdentity, evaluateControllerIdentity } from "./github.identity";
import { repositoryOf } from "../testing/github.fake";

describe("evaluateControllerIdentity", () => {
  it("uses the repository owner for a personal repository", () => {
    expect(evaluateControllerIdentity(repositoryOf(), "octo-owner", undefined)).toMatchObject({
      ok: true,
      owner: "octo-owner"
    });
  });

  it("compares logins without regard to case", () => {
    expect(evaluateControllerIdentity(repositoryOf(), "OCTO-OWNER", undefined).ok).toBe(true);
  });

  it("requires an explicit owner for an organization repository", () => {
    const org = repositoryOf({
      fullName: "acme/app",
      ownerLogin: "acme",
      ownerType: "Organization"
    });
    expect(evaluateControllerIdentity(org, "alice", undefined)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Set "owner"')
    });
    expect(evaluateControllerIdentity(org, "alice", "alice")).toMatchObject({
      ok: true,
      owner: "alice"
    });
  });

  it("refuses when gh is signed in as someone else", () => {
    expect(evaluateControllerIdentity(repositoryOf(), "stranger", undefined)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("stranger")
    });
  });

  it("lets a configured owner differ from the repository owner", () => {
    const result = evaluateControllerIdentity(repositoryOf(), "maintainer", "maintainer");
    expect(result).toMatchObject({ ok: true, owner: "maintainer" });
  });
});

describe("checkControllerIdentity", () => {
  it("reads the repository and the viewer from the port", async () => {
    const result = await checkControllerIdentity(
      {
        repository: () => Promise.resolve(repositoryOf()),
        viewer: () => Promise.resolve("octo-owner")
      },
      undefined
    );
    expect(result.ok).toBe(true);
  });
});
