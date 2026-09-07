import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Hotel } from "../../types";

export function OrgHotels() {
  const queryClient = useQueryClient();
  const hotelsQuery = useQuery({ queryKey: ["hotels"], queryFn: () => api.get<Hotel[]>("/hotels") });
  const [editing, setEditing] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/hotels/${id}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hotels"] }),
  });

  const errorMessage = updateMutation.error instanceof Error ? updateMutation.error.message : null;

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Hotels</h2>
      <p className="text-sm text-ink-500 mb-4">Rename the hotels in your portfolio.</p>
      {errorMessage && <p className="text-sm text-rose-400 mb-4">{errorMessage}</p>}
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {hotelsQuery.data?.map((hotel) => (
              <tr key={hotel.id}>
                <td className="px-4 py-2 text-ink-500 font-mono">{hotel.code}</td>
                <td className="px-4 py-2">
                  <input
                    value={editing[hotel.id] ?? hotel.name}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [hotel.id]: e.target.value }))}
                    className="input-field max-w-xs py-1"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => updateMutation.mutate({ id: hotel.id, name: editing[hotel.id] ?? hotel.name })}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
