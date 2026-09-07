const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let authToken: string | null = localStorage.getItem("token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export function getAuthToken() {
  return authToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | undefined)?.error;
  if (!error) return fallback;
  if (typeof error === "string") return error;
  // zod's flatten() shape: { formErrors: string[], fieldErrors: Record<string, string[]> }
  const flattened = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
  const messages = [
    ...(flattened.formErrors ?? []),
    ...Object.values(flattened.fieldErrors ?? {}).flat(),
  ];
  return messages.length > 0 ? messages.join(" ") : fallback;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = extractErrorMessage(body, message);
    } catch {
      // ignore body parse failure
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  async download(path: string, filename: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(`${API_URL}${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status, res.statusText);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
