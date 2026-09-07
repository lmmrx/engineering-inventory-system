import { Role } from "../../types";

export interface SettingsItem {
  to: string;
  label: string;
  roles: Role[];
}

export interface SettingsGroup {
  label: string;
  items: SettingsItem[];
}

const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "STAFF"];

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Account",
    items: [
      { to: "profile", label: "Profile", roles: ALL_ROLES },
      { to: "security", label: "Security", roles: ALL_ROLES },
    ],
  },
  {
    label: "Organization",
    items: [
      { to: "organization/hotels", label: "Hotels", roles: ["ADMIN"] },
      { to: "organization/users", label: "Users", roles: ["ADMIN", "MANAGER"] },
      { to: "organization/categories", label: "Categories", roles: ["ADMIN", "MANAGER"] },
      { to: "organization/departments", label: "Departments", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Access",
    items: [{ to: "roles", label: "Roles & Permissions", roles: ALL_ROLES }],
  },
  {
    label: "Data",
    items: [{ to: "data", label: "Export data", roles: ["ADMIN", "MANAGER"] }],
  },
  {
    label: "Platform",
    items: [
      { to: "notifications", label: "Notifications", roles: ["ADMIN"] },
      { to: "appearance", label: "Appearance", roles: ["ADMIN"] },
      { to: "language", label: "Language & Region", roles: ["ADMIN"] },
      { to: "communications", label: "Communications", roles: ["ADMIN"] },
    ],
  },
];

export function settingsGroupsForRole(role: Role): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
