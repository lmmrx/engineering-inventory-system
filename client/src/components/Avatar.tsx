import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * A round profile photo, or the person's initial when they haven't added one
 * (or while it loads). Photos are fetched with the sign-in token, since they
 * aren't public, and cached per version so a new photo shows immediately.
 */
export function Avatar({
  userId,
  name,
  version,
  size = 32,
  className = "",
}: {
  userId: string;
  name: string;
  version?: number | null;
  size?: number;
  className?: string;
}) {
  const photo = useQuery({
    queryKey: ["avatar", userId, version],
    queryFn: async () => URL.createObjectURL(await api.blob(`/avatars/${userId}?v=${version}`)),
    enabled: !!version,
    staleTime: Infinity,
    retry: false,
  });

  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (version && photo.data) {
    return (
      <img
        src={photo.data}
        alt=""
        style={style}
        className={`rounded-full object-cover flex-none bg-navy-800 ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`rounded-full bg-gold-500 text-white font-semibold flex items-center justify-center flex-none ${className}`}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
