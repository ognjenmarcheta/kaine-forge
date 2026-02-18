import { useContext } from "react";

import type { AuthContextValue } from "../features/auth/auth.type";
import { AuthContext } from "../providers/auth.provider";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
