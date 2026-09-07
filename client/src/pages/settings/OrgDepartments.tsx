import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Department } from "../../types";

const LIVE_CODES = new Set(["ENGINEERING"]);

export function OrgDepartments() {
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
  });

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Departments</h2>
      <p className="text-sm text-ink-500 mb-4">
        Engineering is live today. The rest are reserved so rolling them out later is a matter of adding
        categories and users — not a system change.
      </p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {departmentsQuery.data?.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 text-ink-500 font-mono">{d.code}</td>
                <td className="px-4 py-2 text-ink-100 font-medium">{d.name}</td>
                <td className="px-4 py-2">
                  {LIVE_CODES.has(d.code) ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                      Live
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-navy-800 text-ink-500">
                      Reserved
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
