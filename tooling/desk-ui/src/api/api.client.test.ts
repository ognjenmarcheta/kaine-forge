import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DeskApiError, createDeskApi, type FetchLike } from "./api.client";

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const failure = async (promise: Promise<unknown>): Promise<DeskApiError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DeskApiError) return error;
  }
  throw new Error("Expected a DeskApiError");
};

describe("createDeskApi", () => {
  it("sends the custom header and a JSON body on a write, and not on a read", async () => {
    const fetchSpy = vi.fn<FetchLike>(() =>
      Promise.resolve(reply(200, { status: "accepted", action: "approve", issueNumber: 7 }))
    );
    const api = createDeskApi(fetchSpy);
    await api.act(7, { action: "approve" });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/issues/7/actions");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ action: "approve" })
    });
    expect(init?.headers).toMatchObject({
      "x-desk-request": "1",
      "Content-Type": "application/json"
    });

    fetchSpy.mockResolvedValueOnce(reply(200, { issues: [] }));
    await api.issues();
    expect(fetchSpy.mock.calls[1]?.[1]?.headers).toBeUndefined();
  });

  it("rejects feedback with no text before it reaches the network", async () => {
    const fetchSpy = vi.fn<FetchLike>();
    const error = await failure(
      createDeskApi(fetchSpy).act(7, { action: "feedback", to: "plan", text: "   " })
    );
    expect(error.code).toBe("bad-request");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [409, "busy", "Another action runs"],
    [409, "ship-refused", "gate failed"],
    [404, "unknown-issue", null],
    [401, "unauthorized", null]
  ])("maps %i %s from the error envelope", async (status, code, detail) => {
    const api = createDeskApi(() => Promise.resolve(reply(status, { error: { code, detail } })));
    const error = await failure(api.issue(7));
    expect(error).toMatchObject({ code, status, detail });
  });

  it("treats an unreadable error body as unauthorized for 401 and internal otherwise", async () => {
    const api401 = createDeskApi(() => Promise.resolve(new Response("nope", { status: 401 })));
    expect((await failure(api401.issues())).code).toBe("unauthorized");
    const api502 = createDeskApi(() =>
      Promise.resolve(new Response("bad gateway", { status: 502 }))
    );
    expect((await failure(api502.issues())).code).toBe("internal");
  });

  it("reports a network failure and a response that breaks the contract", async () => {
    const down = createDeskApi(() => Promise.reject(new TypeError("fetch failed")));
    expect((await failure(down.issues())).code).toBe("network");
    const odd = createDeskApi(() => Promise.resolve(reply(200, { issues: "no" })));
    expect((await failure(odd.issues())).code).toBe("invalid-response");
  });

  it("validates a JSON artifact and treats a missing one as artifact-missing", async () => {
    const api = createDeskApi((input) =>
      Promise.resolve(
        input.endsWith("/plan")
          ? reply(404, { error: { code: "artifact-missing", detail: null } })
          : new Response('{"n":1}')
      )
    );
    const schema = z.object({ n: z.number() });
    expect(await api.artifactJson(7, "build", schema)).toEqual({ n: 1 });
    expect((await failure(api.artifactJson(7, "plan", schema))).code).toBe("artifact-missing");
    expect((await failure(api.artifactJson(7, "build", z.object({ n: z.string() })))).code).toBe(
      "invalid-response"
    );
  });

  it("posts the launch token to the session route", async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(reply(200, { ok: true })));
    await createDeskApi(fetchSpy).exchangeSession("abc");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/session");
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ token: "abc" }));
  });
});
