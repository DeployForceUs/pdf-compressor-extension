import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLocale, supportedLocales } from "../lib/i18n/types";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      <span className="language-switcher__label">{t("language.label")}</span>
      <div className="language-switcher__options">
        {supportedLocales.map((candidate) => {
          const active = candidate === locale;
          return (
            <button
              key={candidate}
              type="button"
              className={active ? "language-switcher__option language-switcher__option--active" : "language-switcher__option"}
              aria-pressed={active}
              onClick={() => {
                void i18n.changeLanguage(candidate);
              }}
            >
              {candidate === "en" ? t("language.english") : t("language.spanish")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
