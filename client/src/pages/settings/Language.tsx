import { useState } from "react";
import { usePreferences } from "../../context/PreferencesContext";
import { useT } from "../../i18n";
import { LANGUAGES, Language } from "../../preferences";

export function LanguageSettings() {
  const t = useT();
  const { preferences, updatePreferences } = usePreferences();
  const [failed, setFailed] = useState(false);

  async function choose(language: Language) {
    setFailed(false);
    try {
      await updatePreferences({ language });
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.language")}</h2>
      <p className="text-sm text-ink-500 mb-4">{t("language.description")}</p>

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("settings.language")}>
        {LANGUAGES.map((language) => {
          const selected = preferences.language === language.value;
          return (
            <button
              key={language.value}
              role="radio"
              aria-checked={selected}
              onClick={() => choose(language.value)}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-start transition ${
                selected ? "border-gold-500 bg-gold-500/10" : "border-navy-700 hover:border-navy-600"
              }`}
            >
              <span className="min-w-0">
                {/* Each language's own name is shown in its own script and direction. */}
                <span className="block text-sm text-ink-100" lang={language.value} dir={language.rtl ? "rtl" : "ltr"}>
                  {language.nativeName}
                </span>
                {language.nativeName !== language.englishName && (
                  <span className="block text-xs text-ink-500" lang="en" dir="ltr">
                    {language.englishName}
                  </span>
                )}
              </span>
              <span
                className={`h-4 w-4 flex-none rounded-full border-2 ${
                  selected ? "border-gold-500 bg-gold-500 shadow-[inset_0_0_0_2px_rgb(var(--navy-900))]" : "border-navy-600"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {failed && <p className="text-xs text-rose-400 mt-3">{t("appearance.saveFailed")}</p>}
      <p className="text-xs text-ink-500 mt-4">{t("language.note")}</p>
    </div>
  );
}
