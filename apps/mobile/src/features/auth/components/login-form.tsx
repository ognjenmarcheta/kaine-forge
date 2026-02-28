import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "../../../components/screen-container";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("test@test.test");
  const [password, setPassword] = useState("ChangeMe123!");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    try {
      setIsSubmitting(true);
      setError(null);
      await login({ email, password });
      router.replace("/dashboard");
    } catch {
      setError(t("error.generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View className="mt-8 rounded-xl bg-ds-surface p-4 shadow-raised">
        <Text className="text-2xl font-semibold text-ds-text">{t("auth.login.title")}</Text>
        <Text className="mt-1 text-sm text-ds-text-subtle">{t("auth.login.subtitle")}</Text>

        <View className="mt-4 gap-3">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
            keyboardType="email-address"
            placeholder={t("auth.form.emailPlaceholder")}
            placeholderTextColor="var(--ds-text-subtlest)"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            autoComplete="password"
            className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
            placeholder={t("auth.form.passwordPlaceholder")}
            placeholderTextColor="var(--ds-text-subtlest)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text className="text-sm text-ds-text-danger">{error}</Text> : null}
          <Pressable
            className="items-center rounded-lg bg-ds-bg-brand-bold px-3 py-2"
            disabled={isSubmitting}
            onPress={() => {
              void onSubmit();
            }}
          >
            <Text className="font-medium text-ds-text-inverse">
              {isSubmitting ? t("common.loadingShort") : t("auth.login.title")}
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text className="text-sm text-ds-text-subtle">{t("auth.login.noAccount")}</Text>
          <Link href="/signup" asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-ds-text">{t("auth.signup.title")}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScreenContainer>
  );
}
