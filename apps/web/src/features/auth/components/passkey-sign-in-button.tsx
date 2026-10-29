import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, FieldError } from "@repo/ui";
import { useState } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { passkeyApi } from "../../../lib/auth-api";

interface PasskeySignInButtonProps {
  onDone: () => void;
}

/** Signs in with a passkey the browser offers; the server resolves the Active Organization. */
export function PasskeySignInButton({ onDone }: PasskeySignInButtonProps) {
  const { completeSignIn } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await completeSignIn(passkeyApi.signIn);
      onDone();
    } catch (signInError) {
      setError(t(getAuthErrorMessageKey(signInError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-ds-100">
      <Button
        appearance="secondary"
        disabled={isSubmitting}
        type="button"
        onClick={() => void signIn()}
      >
        {isSubmitting ? t("common.loadingShort") : t("auth.login.usePasskey")}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
