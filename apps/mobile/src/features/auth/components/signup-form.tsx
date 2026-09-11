import { validateAuthSignupForm } from "@repo/auth/form";
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

import { ScreenContainer } from "../../../components/screen-container";
import { ThemeOptions } from "../../../components/theme-options";
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
    // Mobile signup UI has no confirm field; reuse password for shared confirm rule.
    const validationError = validateAuthSignupForm({
      name,
      email,
      password,
      confirmPassword: password
    });
    if (validationError) {
      setError(t(validationError));
      return;
    }

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
    <ScreenContainer includeTopInset>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <ThemeOptions />
          <Card className="mt-4 border-0">
            <CardHeader>
              <CardTitle>{t("auth.signup.title")}</CardTitle>
              <CardDescription>{t("auth.signup.subtitle")}</CardDescription>
            </CardHeader>

            <CardContent className="gap-3">
              <Text variant="label">{t("common.nameLabel")}</Text>
              <Input
                accessibilityLabel={t("common.nameLabel")}
                placeholder={t("auth.form.namePlaceholder")}
                value={name}
                onChangeText={setName}
              />
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
              {error ? <Text className="text-sm text-ds-text-danger">{error}</Text> : null}
              <Button
                disabled={isSubmitting}
                onPress={() => {
                  void onSubmit();
                }}
              >
                {isSubmitting ? t("common.loadingShort") : t("auth.signup.title")}
              </Button>
            </CardContent>

            <View className="mt-4 flex-row items-center justify-center gap-1">
              <Text variant="caption">{t("auth.signup.hasAccount")}</Text>
              <Link href="/login" asChild>
                <Pressable className="min-h-12 justify-center">
                  <Text className="text-sm font-semibold text-ds-link">
                    {t("auth.login.title")}
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
