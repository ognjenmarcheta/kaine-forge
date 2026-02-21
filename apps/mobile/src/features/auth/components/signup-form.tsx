import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "../../../components/screen-container";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();
  const { t } = useTranslation();

  const [name, setName] = useState("Test User");
  const [email, setEmail] = useState("test@test.test");
  const [password, setPassword] = useState("ChangeMe123!");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    try {
      setIsSubmitting(true);
      setError(null);
      await signup({ email, name, password });
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
        <Text className="text-2xl font-semibold text-ds-text">{t("auth.signup.title")}</Text>
        <Text className="mt-1 text-sm text-ds-text-subtle">{t("auth.signup.subtitle")}</Text>

        <View className="mt-4 gap-3">
          <TextInput
            className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
            placeholder={t("auth.form.namePlaceholder")}
            placeholderTextColor="#6b7280"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
            keyboardType="email-address"
            placeholder={t("auth.form.emailPlaceholder")}
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            autoComplete="password"
            className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
            placeholder={t("auth.form.passwordPlaceholder")}
            placeholderTextColor="#6b7280"
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
              {isSubmitting ? "..." : t("auth.signup.title")}
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text className="text-sm text-ds-text-subtle">{t("auth.signup.hasAccount")}</Text>
          <Link href="/login" asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-ds-text">{t("auth.login.title")}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScreenContainer>
  );
}
