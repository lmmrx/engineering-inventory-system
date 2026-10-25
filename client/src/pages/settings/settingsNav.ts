import type { MessageKey } from "../../i18n";
import { CurrentUser, Permission, Role, can } from "../../types";

export interface SettingsItem {
  to: string;
  /** Translation key for the menu label. */
  label: MessageKey;
  roles: Role[];
  /** Also shown to anyone with this permission, e.g. granted to a Staff member. */
  permission?: Permission;
}

export interface SettingsGroup {
  label: MessageKey;
  items: SettingsItem[];
}

const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "SUPERVISOR", "STAFF"];

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
      { to: "organization/users", label: "settings.users", roles: [], permission: "manage_staff" },
      { to: "organization/categories", label: "settings.categories", roles: [], permission: "manage_categories" },
      { to: "organization/departments", label: "settings.departments", roles: ["ADMIN"] },
    ],
  },
  {
    label: "settings.group.access",
    items: [{ to: "roles", label: "settings.roles", roles: ["ADMIN", "MANAGER", "SUPERVISOR"] }],
  },
  {
    label: "settings.group.data",
    items: [
      { to: "data", label: "settings.export", roles: [], permission: "reports" },
      { to: "audit-log", label: "settings.auditLog", roles: [], permission: "audit_log" },
    ],
  },
];

export function settingsGroupsForUser(user: CurrentUser): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.roles.includes(user.role) || (item.permission !== undefined && can(user, item.permission))
    ),
  })).filter((group) => group.items.length > 0);
}
