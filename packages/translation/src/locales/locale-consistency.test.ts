import { describe, expect, it } from "vitest";

import authDe from "./de/auth.json";
import commonDe from "./de/common.json";
import dashboardDe from "./de/dashboard.json";
import navigationDe from "./de/navigation.json";
import todosDe from "./de/todos.json";
import authEn from "./en/auth.json";
import commonEn from "./en/common.json";
import dashboardEn from "./en/dashboard.json";
import navigationEn from "./en/navigation.json";
import todosEn from "./en/todos.json";
import authSr from "./sr/auth.json";
import commonSr from "./sr/common.json";
import dashboardSr from "./sr/dashboard.json";
import navigationSr from "./sr/navigation.json";
import todosSr from "./sr/todos.json";

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((left, right) => left.localeCompare(right));
}

const baseline = {
  auth: sortedKeys(authEn),
  common: sortedKeys(commonEn),
  dashboard: sortedKeys(dashboardEn),
  navigation: sortedKeys(navigationEn),
  todos: sortedKeys(todosEn)
};

describe("translation locale consistency", () => {
  it("matches Serbian keys with English baseline", () => {
    expect(sortedKeys(authSr)).toEqual(baseline.auth);
    expect(sortedKeys(commonSr)).toEqual(baseline.common);
    expect(sortedKeys(dashboardSr)).toEqual(baseline.dashboard);
    expect(sortedKeys(navigationSr)).toEqual(baseline.navigation);
    expect(sortedKeys(todosSr)).toEqual(baseline.todos);
  });

  it("matches German keys with English baseline", () => {
    expect(sortedKeys(authDe)).toEqual(baseline.auth);
    expect(sortedKeys(commonDe)).toEqual(baseline.common);
    expect(sortedKeys(dashboardDe)).toEqual(baseline.dashboard);
    expect(sortedKeys(navigationDe)).toEqual(baseline.navigation);
    expect(sortedKeys(todosDe)).toEqual(baseline.todos);
  });
});
