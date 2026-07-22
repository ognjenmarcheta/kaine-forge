/** Shared auth form rules for web and mobile. Returns i18n message keys, not translated strings. */

export const AUTH_PASSWORD_MIN_LENGTH = 8;

export type AuthFormErrorKey =
  | "auth.form.error.confirmPasswordRequired"
  | "auth.form.error.emailInvalid"
  | "auth.form.error.emailRequired"
  | "auth.form.error.nameRequired"
  | "auth.form.error.passwordMinLength"
  | "auth.form.error.passwordMismatch"
  | "auth.form.error.passwordRequired";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthName(value: string): AuthFormErrorKey | undefined {
  if (value.trim().length === 0) {
    return "auth.form.error.nameRequired";
  }
  return undefined;
}

export function validateAuthEmail(value: string): AuthFormErrorKey | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "auth.form.error.emailRequired";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "auth.form.error.emailInvalid";
  }
  return undefined;
}

/** Login only requires a non-empty password (server enforces strength). */
export function validateAuthPasswordRequired(value: string): AuthFormErrorKey | undefined {
  if (value.length === 0) {
    return "auth.form.error.passwordRequired";
  }
  return undefined;
}

/** Signup enforces minimum length shared with product copy (8 characters). */
export function validateAuthPasswordForSignup(value: string): AuthFormErrorKey | undefined {
  const required = validateAuthPasswordRequired(value);
  if (required) {
    return required;
  }
  if (value.length < AUTH_PASSWORD_MIN_LENGTH) {
    return "auth.form.error.passwordMinLength";
  }
  return undefined;
}

export function validateAuthConfirmPassword(
  password: string,
  confirmPassword: string
): AuthFormErrorKey | undefined {
  if (confirmPassword.length === 0) {
    return "auth.form.error.confirmPasswordRequired";
  }
  if (confirmPassword !== password) {
    return "auth.form.error.passwordMismatch";
  }
  return undefined;
}

export function validateAuthLoginForm(input: {
  email: string;
  password: string;
}): AuthFormErrorKey | undefined {
  return validateAuthEmail(input.email) ?? validateAuthPasswordRequired(input.password);
}

export function validateAuthSignupForm(input: {
  confirmPassword: string;
  email: string;
  name: string;
  password: string;
}): AuthFormErrorKey | undefined {
  return (
    validateAuthName(input.name) ??
    validateAuthEmail(input.email) ??
    validateAuthPasswordForSignup(input.password) ??
    validateAuthConfirmPassword(input.password, input.confirmPassword)
  );
}
