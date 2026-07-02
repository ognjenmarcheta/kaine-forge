import { describe, expect, it, vi } from "vitest";

import {
  createAuthMock,
  createRequest,
  createResponse,
  dispatch,
  session
} from "./auth.transport.test-helpers";

describe("email verification routes", () => {
  it("verifies the email with a valid token", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/verify-email",
        body: { token: "tok" }
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.verifyEmail).toHaveBeenCalledWith({ token: "tok" });
  });

  it("rejects verify-email without a token", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/verify-email",
        body: {}
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(auth.verifyEmail).not.toHaveBeenCalled();
  });

  it("maps an invalid token to 400", async () => {
    const auth = createAuthMock({
      verifyEmail: vi.fn().mockRejectedValue(new Error("invalid or expired token"))
    });
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/verify-email",
        body: { token: "bad" }
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "invalid or expired token" });
  });

  it("resends the verification email for the session user", async () => {
    const auth = createAuthMock();
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/resend-email-verification"
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(auth.resendEmailVerification).toHaveBeenCalledWith({ user: session.user });
  });

  it("rejects resend-email-verification without a session", async () => {
    const auth = createAuthMock({
      getSessionFromHeaders: vi.fn().mockResolvedValue(null)
    });
    const res = createResponse();

    await dispatch(
      auth,
      createRequest({
        method: "POST",
        url: "/api/auth/resend-email-verification"
      }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect(auth.resendEmailVerification).not.toHaveBeenCalled();
  });
});
