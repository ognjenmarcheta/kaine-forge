import { Redirect } from "expo-router";

import { useAuth } from "../src/hooks/use-auth";

export default function IndexRoute() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={session ? "/dashboard" : "/login"} />;
}
