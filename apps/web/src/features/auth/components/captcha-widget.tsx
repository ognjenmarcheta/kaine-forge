import { Turnstile } from "@marsidev/react-turnstile";

import { AUTH_CONFIG } from "../auth.config";

interface CaptchaWidgetProps {
  onTokenChange: (token: string | null) => void;
  // Turnstile tokens are single-use; change this key after every submit to
  // mount a fresh widget and get a new token.
  resetKey: number;
}

/** Renders Cloudflare Turnstile when a site key is configured; otherwise nothing. */
export function CaptchaWidget({ onTokenChange, resetKey }: CaptchaWidgetProps) {
  if (!AUTH_CONFIG.captchaSiteKey) {
    return null;
  }

  return (
    <Turnstile
      key={resetKey}
      siteKey={AUTH_CONFIG.captchaSiteKey}
      options={{ language: "auto", size: "flexible", theme: "auto" }}
      onError={() => onTokenChange(null)}
      onExpire={() => onTokenChange(null)}
      onSuccess={(token) => onTokenChange(token)}
    />
  );
}

/** True when the form must wait for a captcha token before it can submit. */
export function isCaptchaPending(token: string | null): boolean {
  return Boolean(AUTH_CONFIG.captchaSiteKey) && !token;
}
