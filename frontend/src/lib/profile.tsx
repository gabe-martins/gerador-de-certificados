import { createContext, useContext } from "react";
import { FileBadge } from "lucide-react";
import type { Profile } from "./types";
export const ProfileContext = createContext<Profile | null>(null);
export function useProfile() {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("Perfil não carregado.");
  return profile;
}
export function BrandLogo({ className = "" }: { className?: string }) {
  const profile = useProfile();
  return profile.logo_url ? (
    <img className={className} src={profile.logo_url} alt={profile.name} />
  ) : (
    <FileBadge className={className} aria-label={profile.name} size={38} />
  );
}
