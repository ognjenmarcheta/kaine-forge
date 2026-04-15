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
import { Pressable, View } from "react-native";

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
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("auth.login.title")}</CardTitle>
          <CardDescription>{t("auth.login.subtitle")}</CardDescription>
        </CardHeader>

        <CardContent className="gap-3">
          <Input
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder={t("auth.form.emailPlaceholder")}
            value={email}
            onChangeText={setEmail}
          />
          <Input
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
            {isSubmitting ? t("common.loadingShort") : t("auth.login.title")}
          </Button>
        </CardContent>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text variant="caption">{t("auth.login.noAccount")}</Text>
          <Link href="/signup" asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-ds-link">{t("auth.signup.title")}</Text>
            </Pressable>
          </Link>
        </View>
      </Card>
    </ScreenContainer>
  );
}
