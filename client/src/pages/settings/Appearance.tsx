import { useState } from "react";
import { Modal } from "../../components/Modal";
import { usePreferences } from "../../context/PreferencesContext";
import { useT } from "../../i18n";
import {
  DEFAULT_PREFERENCES,
  FONT_FAMILIES,
  FONT_SIZES,
  FontFamily,
  FontSize,
  Preferences,
  Theme,
  ZOOMS,
  applyPreferences,
} from "../../preferences";

export function AppearanceSettings() {
  const t = useT();
  const { preferences, updatePreferences } = usePreferences();
  const [fontOpen, setFontOpen] = useState(false);
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);

  async function save(patch: Partial<Preferences>) {
    setStatus(null);
    try {
      await updatePreferences(patch);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }

  const themes: { value: Theme; label: string }[] = [
    { value: "dark", label: t("appearance.dark") },
    { value: "light", label: t("appearance.light") },
    { value: "system", label: t("appearance.system") },
  ];

  return (
    <div className="card p-5 max-w-2xl space-y-6">
      <div>
        <h2 className="font-semibold text-ink-100 mb-1">{t("settings.appearance")}</h2>
        <p className="text-sm text-ink-500">{t("appearance.description")}</p>
      </div>

      <section>
        <h3 className="label-field">{t("appearance.theme")}</h3>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("appearance.theme")}>
          {themes.map((theme) => (
            <button
              key={theme.value}
              role="radio"
              aria-checked={preferences.theme === theme.value}
              onClick={() => save({ theme: theme.value })}
              className={`rounded-md border p-2 text-sm transition ${
                preferences.theme === theme.value
                  ? "border-gold-500 bg-gold-500/10 text-ink-100"
                  : "border-navy-700 text-ink-300 hover:border-navy-600"
              }`}
            >
              <ThemeSwatch theme={theme.value} />
              <span className="block mt-2">{theme.label}</span>
            </button>
          ))}
        </div>
        {preferences.theme === "system" && <p className="text-xs text-ink-500 mt-2">{t("appearance.systemHint")}</p>}
      </section>

      <section>
        <h3 className="label-field">{t("appearance.font")}</h3>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-navy-700 px-3 py-2.5">
          <span className="text-sm text-ink-200">
            {t(`size.${preferences.fontSize}`)} · {t(`family.${preferences.fontFamily}`)}
          </span>
          <button onClick={() => setFontOpen(true)} className="btn-ghost text-xs px-2.5 py-1.5">
            {t("appearance.customizeFont")}
          </button>
        </div>
      </section>

      <section>
        <h3 className="label-field">{t("appearance.zoom")}</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("appearance.zoom")}>
          {ZOOMS.map((zoom) => (
            <button
              key={zoom}
              role="radio"
              aria-checked={preferences.zoom === zoom}
              onClick={() => save({ zoom })}
              className={`rounded-md border px-3 py-1.5 text-sm tabular-nums transition ${
                preferences.zoom === zoom
                  ? "border-gold-500 bg-gold-500/10 text-ink-100"
                  : "border-navy-700 text-ink-300 hover:border-navy-600"
              }`}
            >
              {zoom}%
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-500 mt-2">{t("appearance.zoomHint")}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy-800 pt-4">
        <button
          onClick={() =>
            save({
              theme: DEFAULT_PREFERENCES.theme,
              fontSize: DEFAULT_PREFERENCES.fontSize,
              fontFamily: DEFAULT_PREFERENCES.fontFamily,
              zoom: DEFAULT_PREFERENCES.zoom,
            })
          }
          className="btn-ghost text-xs px-2.5 py-1.5"
        >
          {t("appearance.reset")}
        </button>
        {status === "saved" && <span className="text-xs text-emerald-400">{t("common.saved")}</span>}
        {status === "failed" && <span className="text-xs text-rose-400">{t("appearance.saveFailed")}</span>}
      </div>

      {fontOpen && (
        <FontDialog
          preferences={preferences}
          onCancel={() => {
            // Undo the live preview.
            applyPreferences(preferences);
            setFontOpen(false);
          }}
          onDone={(fontSize, fontFamily) => {
            setFontOpen(false);
            save({ fontSize, fontFamily });
          }}
        />
      )}
    </div>
  );
}

/** A tiny picture of the theme: page, card and text lines. */
function ThemeSwatch({ theme }: { theme: Theme }) {
  const dark = { page: "#0d1117", card: "#161b22", line: "#8b949e", accent: "#1f6feb" };
  const light = { page: "#ffffff", card: "#f6f8fa", line: "#59636e", accent: "#0969da" };
  const half = (c: typeof dark) => (
    <>
      <div className="h-full w-full" style={{ backgroundColor: c.page }}>
        <div className="m-1.5 rounded-sm p-1.5 space-y-1" style={{ backgroundColor: c.card }}>
          <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.line }} />
          <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: c.line, opacity: 0.6 }} />
          <div className="h-1.5 w-1/3 rounded-sm" style={{ backgroundColor: c.accent }} />
        </div>
      </div>
    </>
  );
  return (
    <div className="h-14 rounded overflow-hidden border border-navy-700 flex" aria-hidden="true">
      {theme === "system" ? (
        <>
          <div className="w-1/2 overflow-hidden">{half(dark)}</div>
          <div className="w-1/2 overflow-hidden">{half(light)}</div>
        </>
      ) : (
        half(theme === "dark" ? dark : light)
      )}
    </div>
  );
}

/** The "Customize font" pop-up: a tiny-to-huge size slider and a font type dropdown, previewed live. */
function FontDialog({
  preferences,
  onCancel,
  onDone,
}: {
  preferences: Preferences;
  onCancel: () => void;
  onDone: (fontSize: FontSize, fontFamily: FontFamily) => void;
}) {
  const t = useT();
  const [sizeIndex, setSizeIndex] = useState(Math.max(0, FONT_SIZES.findIndex((f) => f.value === preferences.fontSize)));
  const [fontFamily, setFontFamily] = useState(preferences.fontFamily);
  const fontSize = FONT_SIZES[sizeIndex].value;

  function preview(nextSize: FontSize, nextFamily: FontFamily) {
    applyPreferences({ ...preferences, fontSize: nextSize, fontFamily: nextFamily });
  }

  return (
    <Modal title={t("appearance.customizeFont")} onClose={onCancel}>
      <div className="space-y-5">
        <div>
          <label htmlFor="font-size" className="label-field">
            {t("appearance.fontSize")}: <span className="text-ink-100">{t(`size.${fontSize}`)}</span>
          </label>
          <input
            id="font-size"
            type="range"
            min={0}
            max={FONT_SIZES.length - 1}
            step={1}
            value={sizeIndex}
            onChange={(e) => {
              const index = Number(e.target.value);
              setSizeIndex(index);
              preview(FONT_SIZES[index].value, fontFamily);
            }}
            className="w-full accent-gold-500"
            aria-valuetext={t(`size.${fontSize}`)}
          />
          <div className="flex justify-between text-ink-500 mt-1" aria-hidden="true">
            <span style={{ fontSize: "11px" }}>{t("size.tiny")}</span>
            <span style={{ fontSize: "18px" }}>{t("size.huge")}</span>
          </div>
        </div>

        <div>
          <label htmlFor="font-family" className="label-field">
            {t("appearance.fontFamily")}
          </label>
          <select
            id="font-family"
            value={fontFamily}
            onChange={(e) => {
              const next = e.target.value as FontFamily;
              setFontFamily(next);
              preview(fontSize, next);
            }}
            className="input-field"
          >
            {FONT_FAMILIES.map((family) => (
              <option key={family.value} value={family.value} style={{ fontFamily: family.stack }}>
                {t(`family.${family.value}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-navy-700 bg-navy-950 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-500 mb-1">{t("appearance.preview")}</p>
          <p className="text-sm text-ink-100">{t("appearance.previewText")}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={() => onDone(fontSize, fontFamily)} className="btn-primary">
            {t("common.done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
