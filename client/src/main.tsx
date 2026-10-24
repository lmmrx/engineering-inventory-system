import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { applyPreferences, loadCachedPreferences } from "./preferences";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

const queryClient = new QueryClient();

// Apply this browser's saved theme, font and language before the first paint,
// so the app doesn't flash dark-then-light (or English-then-another-language).
applyPreferences(loadCachedPreferences());

// In autoUpdate mode this reloads the page once a newly deployed version has
// been downloaded and activated, so users never sit on a stale cached build.
// An installed app can stay open for days without a navigation, so also look
// for a new deploy whenever it comes back to the foreground — a moment when a
// reload won't interrupt someone mid-form.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PreferencesProvider>
            <App />
          </PreferencesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
