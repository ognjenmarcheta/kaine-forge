import { validateAuthLoginForm } from "@repo/auth/form";
import type { AuthSocialProvider } from "@repo/auth/transport";
import { getAuthErrorMessageKey, isTwoFactorRequiredError } from "@repo/auth/transport";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Text
} from "@repo/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";

import { CaptchaWidget, isCaptchaPending } from "./captcha-widget";
import { ScreenContainer } from "../../../components/screen-container";
import { ThemeOptions } from "../../../components/theme-options";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { signInWithSocialRequest } from "../../../lib/auth-api";
import { AUTH_CONFIG } from "../auth.config";

const SOCIAL_PROVIDER_LABEL_KEYS = {
  github: "auth.social.github",
  google: "auth.social.google"
} as const satisfies Record<AuthSocialProvider, string>;

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("test@test.test");
  const [password, setPassword] = useState("ChangeMe123!");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function onSubmit() {
    const validationError = validateAuthLoginForm({ email, password });
    if (validationError) {
      setError(t(validationError));
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await login({ email, password, ...(captchaToken ? { captchaToken } : {}) });
      router.replace("/dashboard");
    } catch (loginError) {
      // Mobile has no two-factor step yet; the web app completes the sign-in.
      setError(
        t(
          isTwoFactorRequiredError(loginError)
            ? "auth.twoFactor.mobileUnsupported"
            : getAuthErrorMessageKey(loginError)
        )
      );
    } finally {
      // Turnstile tokens are single-use, so every attempt needs a new one.
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
      setIsSubmitting(false);
    }
  }

  function onSocialPress(provider: AuthSocialProvider) {
    setError(null);
    setIsSubmitting(true);
    signInWithSocialRequest(provider)
      .then(() => {
        router.replace("/dashboard");
      })
      .catch(() => {
        setError(t("error.generic"));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  return (
    <ScreenContainer includeTopInset>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <ThemeOptions />
          <Card className="mt-4 border-0">
            <CardHeader>
              <CardTitle>{t("auth.login.title")}</CardTitle>
              <CardDescription>{t("auth.login.subtitle")}</CardDescription>
            </CardHeader>

            <CardContent className="gap-3">
              <Text variant="label">{t("common.emailLabel")}</Text>
              <Input
                accessibilityLabel={t("common.emailLabel")}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder={t("auth.form.emailPlaceholder")}
                value={email}
                onChangeText={setEmail}
              />
              <Text variant="label">{t("common.passwordLabel")}</Text>
              <Input
                accessibilityLabel={t("common.passwordLabel")}
                autoComplete="password"
                placeholder={t("auth.form.passwordPlaceholder")}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <CaptchaWidget resetKey={captchaResetKey} onTokenChange={setCaptchaToken} />
              {error ? <Text className="text-sm text-ds-text-danger">{error}</Text> : null}
              <Button
                disabled={isSubmitting || isCaptchaPending(captchaToken)}
                onPress={() => {
                  void onSubmit();
                }}
              >
                {isSubmitting ? t("common.loadingShort") : t("auth.login.title")}
              </Button>
              {AUTH_CONFIG.socialProviders.map((provider) => (
                <Button
                  key={provider}
                  appearance="secondary"
                  disabled={isSubmitting}
                  onPress={() => {
                    onSocialPress(provider);
                  }}
                >
                  {t(SOCIAL_PROVIDER_LABEL_KEYS[provider])}
                </Button>
              ))}
            </CardContent>

            <View className="mt-4 flex-row items-center justify-center gap-1">
              <Text variant="caption">{t("auth.login.noAccount")}</Text>
              <Link href="/signup" asChild>
                <Pressable className="min-h-12 justify-center">
                  <Text className="text-sm font-semibold text-ds-link">
                    {t("auth.signup.title")}
                  </Text>
                </Pressable>
              </Link>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
