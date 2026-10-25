import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Department } from "../../types";
import { useT } from "../../i18n";

export function OrgDepartments() {
  const t = useT();
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
  });

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.departments")}</h2>
      <p className="text-sm text-ink-500 mb-4">
        {t("org.departmentsHint")}
      </p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("org.code")}</th>
              <th className="px-4 py-2">{t("org.name")}</th>
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
