interface Capability {
  label: string;
  admin: boolean;
  manager: boolean;
  staff: boolean;
}

const CAPABILITIES: Capability[] = [
  { label: "View inventory & log stock movements", admin: true, manager: true, staff: true },
  { label: "Create work orders & update their status", admin: true, manager: true, staff: true },
  { label: "Create purchase requests", admin: true, manager: true, staff: true },
  { label: "Mark a purchase request as received", admin: true, manager: true, staff: true },
  { label: "Approve or reject purchase requests", admin: true, manager: true, staff: false },
  { label: "Add or edit inventory items", admin: true, manager: true, staff: false },
  { label: "Manage categories", admin: true, manager: true, staff: false },
  { label: "Create Staff accounts", admin: true, manager: true, staff: false },
  { label: "Create Manager or Admin accounts", admin: true, manager: false, staff: false },
  { label: "Edit any user's role, hotel, or password", admin: true, manager: false, staff: false },
  { label: "Rename hotels", admin: true, manager: false, staff: false },
  { label: "View or act on other hotels' data", admin: true, manager: false, staff: false },
  { label: "Export inventory / transaction data", admin: true, manager: true, staff: false },
];

function Mark({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="text-emerald-400" aria-label="Allowed">
      ✓
    </span>
  ) : (
    <span className="text-ink-600" aria-label="Not allowed">
      —
    </span>
  );
}

export function RolesPermissions() {
  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Roles & permissions</h2>
      <p className="text-sm text-ink-500 mb-4">
        What each role can do. Manager and Staff actions are always limited to their own hotel — only Admin can
        act across the whole portfolio.
      </p>
      <div className="table-shell overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Capability</th>
              <th className="px-4 py-2 text-center">Admin</th>
              <th className="px-4 py-2 text-center">Manager</th>
              <th className="px-4 py-2 text-center">Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {CAPABILITIES.map((c) => (
              <tr key={c.label}>
                <td className="px-4 py-2 text-ink-200">{c.label}</td>
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
