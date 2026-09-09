import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Department } from "../../types";

export function OrgDepartments() {
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
  });

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Departments</h2>
      <p className="text-sm text-ink-500 mb-4">
        Every department is live. Switch between them from the account menu (top right) to manage each one's
        categories, inventory, purchase requests, and work orders.
      </p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {departmentsQuery.data?.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 text-ink-500 font-mono">{d.code}</td>
                <td className="px-4 py-2 text-ink-100 font-medium">{d.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
