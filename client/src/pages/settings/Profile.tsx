import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Avatar } from "../../components/Avatar";
import { useAuth } from "../../context/AuthContext";
import { useT } from "../../i18n";
import { CurrentUser } from "../../types";

const PHOTO_SIZE = 256;

/**
 * Crops a picture to a centered square and shrinks it to PHOTO_SIZE pixels,
 * so even a large phone photo uploads as a small (~20–40 KB) JPEG.
 */
async function toSquarePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("empty image");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d")!;
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileSettings() {
  const { user, updateUser } = useAuth();
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<CurrentUser>("/me", { name, position, phone }),
    onSuccess: (updated) => {
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const photoMutation = useMutation({
    mutationFn: (image: string | null) =>
      image ? api.put<CurrentUser>("/me/avatar", { image }) : api.delete<CurrentUser>("/me/avatar"),
    onSuccess: (updated) => updateUser({ avatarVersion: updated.avatarVersion }),
  });

  async function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still triggers a change
    if (!file) return;
    setPhotoError(false);
    try {
      photoMutation.mutate(await toSquarePhoto(file));
    } catch {
      setPhotoError(true);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  }

  if (!user) return null;

  const photoServerError = photoMutation.error instanceof Error ? photoMutation.error.message : null;

  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.profile")}</h2>
      <p className="text-sm text-ink-500 mb-5">{t("profile.description")}</p>

      <div className="flex items-center gap-4 mb-5">
        <Avatar userId={user.id} name={user.name} version={user.avatarVersion} size={72} />
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={photoMutation.isPending}
              className="btn-ghost text-xs px-2.5 py-1.5"
            >
              {photoMutation.isPending
                ? t("common.saving")
                : user.avatarVersion
                ? t("profile.changePhoto")
                : t("profile.uploadPhoto")}
            </button>
            {user.avatarVersion && (
              <button
                type="button"
                onClick={() => photoMutation.mutate(null)}
                disabled={photoMutation.isPending}
                className="text-xs px-2.5 py-1.5 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10"
              >
                {t("profile.removePhoto")}
              </button>
            )}
          </div>
          <p className="text-xs text-ink-500">{t("profile.photoHint")}</p>
          {(photoError || photoServerError) && (
            <p className="text-xs text-rose-400">{photoServerError ?? t("profile.photoError")}</p>
          )}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="hidden" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="label-field">{t("profile.displayName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required maxLength={100} />
        </label>

        <label className="block">
          <span className="label-field">{t("profile.position")}</span>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t("profile.positionPlaceholder")}
            className="input-field"
            maxLength={100}
          />
        </label>

        <label className="block">
          <span className="label-field">{t("profile.phone")}</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("profile.phonePlaceholder")}
            className="input-field"
            autoComplete="tel"
            maxLength={30}
          />
        </label>

        {/* Set by whoever manages the account, so it's shown here but not editable. */}
        <div>
          <span className="label-field">{t("profile.manager")}</span>
          <p className="text-sm text-ink-200">{user.manager?.name ?? t("profile.noManager")}</p>
          <span className="block text-xs text-ink-500 mt-0.5">{t("profile.managerHint")}</span>
        </div>

        <label className="block">
          <span className="label-field">{t("profile.email")}</span>
          <input value={user.email} disabled className="input-field opacity-60 cursor-not-allowed" />
        </label>

        <div>
          <span className="label-field">{t("profile.role")}</span>
          <p className="text-sm text-ink-200">{t(`role.${user.role}`)}</p>
        </div>

        {mutation.isError && (
          <p className="text-sm text-rose-400">
            {mutation.error instanceof Error && mutation.error.message ? mutation.error.message : t("profile.error")}
          </p>
        )}
        {saved && <p className="text-sm text-emerald-400">{t("profile.updated")}</p>}

        <div className="pt-2">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}
