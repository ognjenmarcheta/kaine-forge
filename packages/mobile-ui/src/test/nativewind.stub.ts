// Tests run without the NativeWind runtime. vars() returns its variables as a plain style.
export function vars<T extends Record<string, string>>(variables: T): T {
  return variables;
}
