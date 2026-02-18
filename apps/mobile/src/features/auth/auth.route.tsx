import { View } from "react-native";

import { LoginForm } from "./components/login-form";
import { SignupForm } from "./components/signup-form";

interface AuthRouteProps {
  mode: "login" | "signup";
}

export function AuthRoute({ mode }: AuthRouteProps) {
  return <View className="flex-1">{mode === "login" ? <LoginForm /> : <SignupForm />}</View>;
}
