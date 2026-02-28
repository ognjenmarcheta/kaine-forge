import i18next, { type i18n } from "i18next";

import authDe from "./locales/de/auth.json";
import commonDe from "./locales/de/common.json";
import dashboardDe from "./locales/de/dashboard.json";
import navigationDe from "./locales/de/navigation.json";
import organizationsDe from "./locales/de/organizations.json";
import todosDe from "./locales/de/todos.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import navigationEn from "./locales/en/navigation.json";
import organizationsEn from "./locales/en/organizations.json";
import todosEn from "./locales/en/todos.json";
import authSr from "./locales/sr/auth.json";
import commonSr from "./locales/sr/common.json";
import dashboardSr from "./locales/sr/dashboard.json";
import navigationSr from "./locales/sr/navigation.json";
import organizationsSr from "./locales/sr/organizations.json";
import todosSr from "./locales/sr/todos.json";
import { DEFAULT_LANGUAGE } from "./translation.definition";

export const translationInstance: i18n = i18next.createInstance();

void translationInstance.init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: DEFAULT_LANGUAGE,
  ns: ["auth", "common", "dashboard", "navigation", "organizations", "todos"],
  defaultNS: "common",
  fallbackNS: ["auth", "dashboard", "navigation", "organizations", "todos"],
  keySeparator: false,
  returnNull: false,
  resources: {
    de: {
      auth: authDe,
      common: commonDe,
      dashboard: dashboardDe,
      navigation: navigationDe,
      organizations: organizationsDe,
      todos: todosDe
    },
    en: {
      auth: authEn,
      common: commonEn,
      dashboard: dashboardEn,
      navigation: navigationEn,
      organizations: organizationsEn,
      todos: todosEn
    },
    sr: {
      auth: authSr,
      common: commonSr,
      dashboard: dashboardSr,
      navigation: navigationSr,
      organizations: organizationsSr,
      todos: todosSr
    }
  }
});
