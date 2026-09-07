import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { CurrentUser } from "../../types";

const roleLabel: Record<string, string> = {
  ADMIN: "Admin — full access across all hotels",
  MANAGER: "Manager — full access within your hotel",
  STAFF: "Staff — day-to-day inventory actions",
};

export function ProfileSettings() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.patch<CurrentUser>("/me", { name }),
    onSuccess: (updated) => {
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  }

  if (!user) return null;

  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">Profile</h2>
      <p className="text-sm text-ink-500 mb-5">Your basic account details.</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="label-field">Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
        </label>

        <label className="block">
          <span className="label-field">Email</span>
          <input value={user.email} disabled className="input-field opacity-60 cursor-not-allowed" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label-field">Role</span>
            <p className="text-sm text-ink-200">{roleLabel[user.role]}</p>
          </div>
        </div>

        {mutation.isError && <p className="text-sm text-rose-400">Could not update profile.</p>}
        {saved && <p className="text-sm text-emerald-400">Profile updated.</p>}

        <div className="pt-2">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
