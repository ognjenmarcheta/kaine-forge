import { describe, expect, it, vi } from "vitest";

import {
  createAuthMock,
  createRequest,
  createResponse,
  dispatch
} from "./auth.transport.test-helpers";

describe("password reset routes", () => {
  it("returns 204 for request-password-reset regardless of account existence", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/request-password-reset",
        body: { email: "anyone@example.com" }
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith({ email: "anyone@example.com" });
  });

  it("rejects request-password-reset without an email", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/request-password-reset",
        body: {}
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("resets the password with a valid token", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/reset-password",
        body: { token: "tok", password: "NewSecret123!" }
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.resetPassword).toHaveBeenCalledWith({ token: "tok", password: "NewSecret123!" });
  });

  it("rejects reset-password without a token or password", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/reset-password",
        body: { token: "tok" }
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });

  it("maps an invalid token to 400", async () => {
    const auth = createAuthMock({
      resetPassword: vi.fn().mockRejectedValue(new Error("invalid or expired token"))
    });
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/reset-password",
        body: { token: "bad", password: "NewSecret123!" }
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "invalid or expired token" });
  });
});
