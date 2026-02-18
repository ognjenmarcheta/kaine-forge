import i18next, { type i18n } from "i18next";

import authDe from "./locales/de/auth.json";
import commonDe from "./locales/de/common.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import navigationEn from "./locales/en/navigation.json";
import todosEn from "./locales/en/todos.json";
import authSr from "./locales/sr/auth.json";
import commonSr from "./locales/sr/common.json";
import { DEFAULT_LANGUAGE } from "./translation.definition";

export const translationInstance: i18n = i18next.createInstance();

void translationInstance.init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  resources: {
    en: {
      common: commonEn,
      auth: authEn,
      navigation: navigationEn,
      dashboard: dashboardEn,
      todos: todosEn
    },
    sr: {
      common: commonSr,
      auth: authSr
    },
    de: {
      common: commonDe,
      auth: authDe
    }
  }
});
