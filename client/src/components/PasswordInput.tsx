import { InputHTMLAttributes, useState } from "react";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5l15 15M8.3 8.4a2.4 2.4 0 0 0 3.3 3.3M6.2 5.1C3.9 6.4 1.5 10 1.5 10s3 6 8.5 6c1.4 0 2.6-.4 3.7-.9M14.8 14.9c1.9-1.3 3.7-3.9 3.7-3.9s-1.1-2.2-3-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PasswordInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-500 hover:text-ink-200"
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}
