import { MessageKey, useT } from "../../i18n";

interface Capability {
  label: MessageKey;
  admin: boolean;
  manager: boolean;
  supervisor: boolean;
  staff: boolean;
  /** Can be granted to an individual on top of their role. */
  grantable?: boolean;
}

const CAPABILITIES: Capability[] = [
  { label: "roles.cap.viewInventory", admin: true, manager: true, supervisor: true, staff: true },
  { label: "roles.cap.workOrders", admin: true, manager: true, supervisor: true, staff: true },
  { label: "roles.cap.createRequests", admin: true, manager: true, supervisor: true, staff: true },
  { label: "roles.cap.receiveRequests", admin: true, manager: true, supervisor: true, staff: true },
  { label: "roles.cap.ownProfile", admin: true, manager: true, supervisor: true, staff: true },
  { label: "roles.cap.approveRequests", admin: true, manager: true, supervisor: true, staff: false, grantable: true },
  { label: "roles.cap.editItems", admin: true, manager: true, supervisor: true, staff: false, grantable: true },
  { label: "roles.cap.analytics", admin: true, manager: true, supervisor: true, staff: false, grantable: true },
  { label: "roles.cap.export", admin: true, manager: true, supervisor: true, staff: false, grantable: true },
  { label: "roles.cap.createStaff", admin: true, manager: true, supervisor: true, staff: false },
  { label: "roles.cap.manageSupervisors", admin: true, manager: true, supervisor: false, staff: false },
  { label: "roles.cap.categories", admin: true, manager: true, supervisor: false, staff: false, grantable: true },
  { label: "roles.cap.auditLog", admin: true, manager: true, supervisor: false, staff: false, grantable: true },
  { label: "roles.cap.createManagers", admin: true, manager: false, supervisor: false, staff: false },
  { label: "roles.cap.moveUsers", admin: true, manager: false, supervisor: false, staff: false },
  { label: "roles.cap.renameHotels", admin: true, manager: false, supervisor: false, staff: false },
  { label: "roles.cap.otherHotels", admin: true, manager: false, supervisor: false, staff: false },
];

function Mark({ granted }: { granted: boolean }) {
  const t = useT();
  return granted ? (
    <span className="text-emerald-400" aria-label={t("roles.allowed")}>
      ✓
    </span>
  ) : (
    <span className="text-ink-600" aria-label={t("roles.notAllowed")}>
      —
    </span>
  );
}

export function RolesPermissions() {
  const t = useT();
  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.roles")}</h2>
      <p className="text-sm text-ink-500 mb-4">
        {t("roles.description")}
      </p>
      <p className="text-sm text-ink-500 mb-4">{t("roles.extrasNote")}</p>
      <div className="table-shell overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("roles.capability")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.ADMIN")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.MANAGER")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.SUPERVISOR")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.STAFF")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {CAPABILITIES.map((c) => (
              <tr key={c.label}>
                <td className="px-4 py-2 text-ink-200">
                  {t(c.label)}
                  {c.grantable && <span className="ms-1.5 text-xs text-gold-400">{t("roles.grantable")}</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.admin} />
                </td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.manager} />
                </td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.supervisor} />
                </td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.staff} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
