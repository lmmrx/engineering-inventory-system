import { MessageKey, useT } from "../../i18n";

interface Capability {
  label: MessageKey;
  admin: boolean;
  manager: boolean;
  staff: boolean;
}

const CAPABILITIES: Capability[] = [
  { label: "roles.cap.viewInventory", admin: true, manager: true, staff: true },
  { label: "roles.cap.workOrders", admin: true, manager: true, staff: true },
  { label: "roles.cap.createRequests", admin: true, manager: true, staff: true },
  { label: "roles.cap.receiveRequests", admin: true, manager: true, staff: true },
  { label: "roles.cap.ownProfile", admin: true, manager: true, staff: true },
  { label: "roles.cap.approveRequests", admin: true, manager: true, staff: false },
  { label: "roles.cap.editItems", admin: true, manager: true, staff: false },
  { label: "roles.cap.categories", admin: true, manager: true, staff: false },
  { label: "roles.cap.createStaff", admin: true, manager: true, staff: false },
  { label: "roles.cap.editStaff", admin: true, manager: true, staff: false },
  { label: "roles.cap.analytics", admin: true, manager: true, staff: false },
  { label: "roles.cap.export", admin: true, manager: true, staff: false },
  { label: "roles.cap.createManagers", admin: true, manager: false, staff: false },
  { label: "roles.cap.moveUsers", admin: true, manager: false, staff: false },
  { label: "roles.cap.renameHotels", admin: true, manager: false, staff: false },
  { label: "roles.cap.otherHotels", admin: true, manager: false, staff: false },
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
      <div className="table-shell overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("roles.capability")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.ADMIN")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.MANAGER")}</th>
              <th className="px-4 py-2 text-center">{t("roleName.STAFF")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {CAPABILITIES.map((c) => (
              <tr key={c.label}>
                <td className="px-4 py-2 text-ink-200">{t(c.label)}</td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.admin} />
                </td>
                <td className="px-4 py-2 text-center">
                  <Mark granted={c.manager} />
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
