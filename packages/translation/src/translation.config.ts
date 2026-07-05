import i18next, { type i18n } from "i18next";

import assistantDe from "./locales/de/assistant.json";
import authDe from "./locales/de/auth.json";
import commonDe from "./locales/de/common.json";
import dashboardDe from "./locales/de/dashboard.json";
import navigationDe from "./locales/de/navigation.json";
import notesDe from "./locales/de/notes.json";
import organizationsDe from "./locales/de/organizations.json";
import storageDe from "./locales/de/storage.json";
import todosDe from "./locales/de/todos.json";
import assistantEn from "./locales/en/assistant.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import navigationEn from "./locales/en/navigation.json";
import notesEn from "./locales/en/notes.json";
import organizationsEn from "./locales/en/organizations.json";
import storageEn from "./locales/en/storage.json";
import todosEn from "./locales/en/todos.json";
import assistantSr from "./locales/sr/assistant.json";
import authSr from "./locales/sr/auth.json";
import commonSr from "./locales/sr/common.json";
import dashboardSr from "./locales/sr/dashboard.json";
import navigationSr from "./locales/sr/navigation.json";
import notesSr from "./locales/sr/notes.json";
import organizationsSr from "./locales/sr/organizations.json";
import storageSr from "./locales/sr/storage.json";
import todosSr from "./locales/sr/todos.json";
import { DEFAULT_LANGUAGE, TRANSLATION_NAMESPACES } from "./translation.definition";

export const translationInstance: i18n = i18next.createInstance();

void translationInstance.init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: DEFAULT_LANGUAGE,
  ns: TRANSLATION_NAMESPACES,
  defaultNS: "common",
  fallbackNS: TRANSLATION_NAMESPACES.filter((namespace) => namespace !== "common"),
  keySeparator: false,
  returnNull: false,
  resources: {
    de: {
      assistant: assistantDe,
      auth: authDe,
      common: commonDe,
      dashboard: dashboardDe,
      navigation: navigationDe,
      notes: notesDe,
      organizations: organizationsDe,
      storage: storageDe,
      todos: todosDe
    },
    en: {
      assistant: assistantEn,
      auth: authEn,
      common: commonEn,
      dashboard: dashboardEn,
      navigation: navigationEn,
      notes: notesEn,
      organizations: organizationsEn,
      storage: storageEn,
      todos: todosEn
    },
    sr: {
      assistant: assistantSr,
      auth: authSr,
      common: commonSr,
      dashboard: dashboardSr,
      navigation: navigationSr,
      notes: notesSr,
      organizations: organizationsSr,
      storage: storageSr,
      todos: todosSr
    }
  }
});
