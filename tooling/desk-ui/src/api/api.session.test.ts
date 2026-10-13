import { describe, expect, it, vi } from "vitest";

import { DeskApiError } from "./api.client";
import { exchangeLaunchToken, launchTokenOf } from "./api.session";
import { fakeApi } from "../test/test.render";

const location = { hash: "#session=tok123", pathname: "/", search: "?issue=7" };

describe("launchTokenOf", () => {
  it.each([
    ["#session=abc", "abc"],
    ["#other=1&session=xyz", "xyz"],
    ["", null],
    ["#session=", ""]
  ])("reads %j", (hash, token) => {
    expect(launchTokenOf(hash)).toBe(token);
  });
});

describe("exchangeLaunchToken", () => {
  it("exchanges the token and strips the fragment", async () => {
    const exchangeSession = vi.fn(() => Promise.resolve());
    const replaceUrl = vi.fn();
    await exchangeLaunchToken(fakeApi({ exchangeSession }), location, replaceUrl);
    expect(exchangeSession).toHaveBeenCalledWith("tok123");
    expect(replaceUrl).toHaveBeenCalledWith("/?issue=7");
  });

  it("does nothing without a token", async () => {
    const exchangeSession = vi.fn(() => Promise.resolve());
    const replaceUrl = vi.fn();
    await exchangeLaunchToken(fakeApi({ exchangeSession }), { ...location, hash: "" }, replaceUrl);
    expect(exchangeSession).not.toHaveBeenCalled();
    expect(replaceUrl).not.toHaveBeenCalled();
  });

  it("accepts a spent token (another tab may hold the cookie) and still strips the fragment", async () => {
    const replaceUrl = vi.fn();
    await exchangeLaunchToken(
      fakeApi({ exchangeSession: () => Promise.reject(new DeskApiError("forbidden", 403, null)) }),
      location,
      replaceUrl
    );
    expect(replaceUrl).toHaveBeenCalled();
  });

  it("throws when the server cannot be reached", async () => {
    await expect(
      exchangeLaunchToken(
        fakeApi({ exchangeSession: () => Promise.reject(new DeskApiError("network", 0, null)) }),
        location,
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "network" });
  });
});
