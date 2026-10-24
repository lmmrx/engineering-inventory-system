import type { MessageKey } from "../../i18n";
import { Role } from "../../types";

export interface SettingsItem {
  to: string;
  /** Translation key for the menu label. */
  label: MessageKey;
  roles: Role[];
}

export interface SettingsGroup {
  label: MessageKey;
  items: SettingsItem[];
}

const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "STAFF"];

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    // Personal preferences: everyone sets their own.
    label: "settings.group.customize",
    items: [
      { to: "profile", label: "settings.profile", roles: ALL_ROLES },
      { to: "profile/appearance", label: "settings.appearance", roles: ALL_ROLES },
      { to: "profile/language", label: "settings.language", roles: ALL_ROLES },
      { to: "profile/notifications", label: "settings.notifications", roles: ALL_ROLES },
      { to: "profile/communications", label: "settings.communications", roles: ALL_ROLES },
    ],
  },
  {
    label: "settings.group.account",
    items: [{ to: "security", label: "settings.security", roles: ALL_ROLES }],
  },
  {
    label: "settings.group.organization",
    items: [
      { to: "organization/hotels", label: "settings.hotels", roles: ["ADMIN"] },
      { to: "organization/users", label: "settings.users", roles: ["ADMIN", "MANAGER"] },
      { to: "organization/categories", label: "settings.categories", roles: ["ADMIN", "MANAGER"] },
      { to: "organization/departments", label: "settings.departments", roles: ["ADMIN"] },
    ],
  },
  {
    label: "settings.group.access",
    items: [{ to: "roles", label: "settings.roles", roles: ["ADMIN", "MANAGER"] }],
  },
  {
    label: "settings.group.data",
    items: [
      { to: "data", label: "settings.export", roles: ["ADMIN", "MANAGER"] },
      { to: "audit-log", label: "settings.auditLog", roles: ["ADMIN", "MANAGER"] },
    ],
  },
];

export function settingsGroupsForRole(role: Role): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
