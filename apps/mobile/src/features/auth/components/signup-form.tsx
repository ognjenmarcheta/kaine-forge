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
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("auth.signup.title")}</CardTitle>
          <CardDescription>{t("auth.signup.subtitle")}</CardDescription>
        </CardHeader>

        <CardContent className="gap-3">
          <Input placeholder={t("auth.form.namePlaceholder")} value={name} onChangeText={setName} />
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
            {isSubmitting ? t("common.loadingShort") : t("auth.signup.title")}
          </Button>
        </CardContent>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text variant="caption">{t("auth.signup.hasAccount")}</Text>
          <Link href="/login" asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-ds-link">{t("auth.login.title")}</Text>
            </Pressable>
          </Link>
        </View>
      </Card>
    </ScreenContainer>
  );
}
