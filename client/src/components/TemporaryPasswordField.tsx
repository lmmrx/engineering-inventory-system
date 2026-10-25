import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "../types";
import { PasswordInput } from "./PasswordInput";
import { useT } from "../i18n";

// No look-alike characters (0/O, 1/l/I), so it can be read out or copied by hand without mistakes.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random password like "k7Rq-mP3x-Wd9f-Tz4h": 16 characters (about 93 bits), in groups of four. */
export function generatePassword() {
  const chars: string[] = [];
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  while (chars.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && chars.length < 16) chars.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/**
 * A temporary-password input with Generate and Copy buttons. A generated
 * password is shown in plain text so it can be passed on; the user must
 * change it at their next sign-in either way.
 */
export function TemporaryPasswordField({
  value,
  onChange,
  required = false,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. not HTTPS); the password is visible to copy by hand.
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          {generated ? (
            <input
              required={required}
              minLength={MIN_PASSWORD_LENGTH}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="input-field font-mono"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("password.temporary")}
            />
          ) : (
            <PasswordInput
              required={required}
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="input-field"
              autoComplete="new-password"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setGenerated(true);
            setCopied(false);
          }}
          className="btn-ghost text-xs px-2.5 flex-none"
        >
          {t("common.generate")}
        </button>
        {generated && value && (
          <button type="button" onClick={copy} className="btn-ghost text-xs px-2.5 flex-none">
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        )}
      </div>
      {generated && value && (
        <p className="text-xs text-ink-500">
          {t("password.copyHint")}
        </p>
      )}
    </div>
  );
}
