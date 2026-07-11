import i18n, { type i18n as I18nInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enTranslation from "../../locales/en/translation.json";
import esTranslation from "../../locales/es/translation.json";
import { defaultLocale, normalizeLocale, supportedLocales } from "./types";

const resources = {
  en: { translation: enTranslation },
  es: { translation: esTranslation },
} as const;

let initialized: Promise<I18nInstance> | null = null;

export async function initI18n() {
  if (!initialized) {
    initialized = (async () => {
      await i18n
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
          resources,
          fallbackLng: defaultLocale,
          supportedLngs: [...supportedLocales],
          nonExplicitSupportedLngs: true,
          interpolation: {
            escapeValue: false,
          },
          detection: {
            order: ["localStorage", "navigator", "htmlTag"],
            caches: ["localStorage"],
          },
          returnNull: false,
          returnEmptyString: false,
        });
      const resolved = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
      await i18n.changeLanguage(resolved);
      document.documentElement.lang = resolved;
      return i18n;
    })();
  }

  return initialized;
}

export { i18n };
