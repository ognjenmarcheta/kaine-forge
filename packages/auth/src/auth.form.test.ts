import { describe, expect, it } from "vitest";

import {
  AUTH_PASSWORD_MIN_LENGTH,
  validateAuthConfirmPassword,
  validateAuthEmail,
  validateAuthLoginForm,
  validateAuthName,
  validateAuthPasswordForSignup,
  validateAuthPasswordRequired,
  validateAuthSignupForm
} from "./auth.form";

describe("auth.form validation", () => {
  it("requires a non-empty trimmed name", () => {
    expect(validateAuthName("")).toBe("auth.form.error.nameRequired");
    expect(validateAuthName("   ")).toBe("auth.form.error.nameRequired");
    expect(validateAuthName("Ada")).toBeUndefined();
  });

  it("requires a plausible email", () => {
    expect(validateAuthEmail("")).toBe("auth.form.error.emailRequired");
    expect(validateAuthEmail("not-an-email")).toBe("auth.form.error.emailInvalid");
    expect(validateAuthEmail("a@b.co")).toBeUndefined();
  });

  it("treats login password as required-only", () => {
    expect(validateAuthPasswordRequired("")).toBe("auth.form.error.passwordRequired");
    expect(validateAuthPasswordRequired("short")).toBeUndefined();
  });

  it("enforces signup password minimum length", () => {
    expect(AUTH_PASSWORD_MIN_LENGTH).toBe(8);
    expect(validateAuthPasswordForSignup("")).toBe("auth.form.error.passwordRequired");
    expect(validateAuthPasswordForSignup("1234567")).toBe("auth.form.error.passwordMinLength");
    expect(validateAuthPasswordForSignup("12345678")).toBeUndefined();
  });

  it("checks confirm password match", () => {
    expect(validateAuthConfirmPassword("secret12", "")).toBe(
      "auth.form.error.confirmPasswordRequired"
    );
    expect(validateAuthConfirmPassword("secret12", "other")).toBe(
      "auth.form.error.passwordMismatch"
    );
    expect(validateAuthConfirmPassword("secret12", "secret12")).toBeUndefined();
  });

  it("composes login and signup form validation", () => {
    expect(validateAuthLoginForm({ email: "", password: "x" })).toBe(
      "auth.form.error.emailRequired"
    );
    expect(validateAuthLoginForm({ email: "a@b.co", password: "" })).toBe(
      "auth.form.error.passwordRequired"
    );
    expect(validateAuthLoginForm({ email: "a@b.co", password: "x" })).toBeUndefined();

    expect(
      validateAuthSignupForm({
        name: "Ada",
        email: "a@b.co",
        password: "short",
        confirmPassword: "short"
      })
    ).toBe("auth.form.error.passwordMinLength");

    expect(
      validateAuthSignupForm({
        name: "Ada",
        email: "a@b.co",
        password: "longenough",
        confirmPassword: "longenough"
      })
    ).toBeUndefined();
  });
});
