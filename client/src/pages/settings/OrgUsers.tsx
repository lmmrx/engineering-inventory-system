import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { AppUser, Department, Hotel, Role } from "../../types";
import { Field, Modal, ModalActions } from "../../components/Modal";
import { PasswordInput } from "../../components/PasswordInput";

export function OrgUsers() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<AppUser[]>("/users") });
  const hotelsQuery = useQuery({ queryKey: ["hotels"], queryFn: () => api.get<Hotel[]>("/hotels") });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments") });

  const hotelCode = (id: string | null) => hotelsQuery.data?.find((h) => h.id === id)?.code ?? "All hotels";
  // The create form defaults its Hotel/Department dropdowns from this data —
  // opening it before both have loaded would silently submit empty IDs.
  const referenceDataReady = hotelsQuery.isSuccess && departmentsQuery.isSuccess;

  if (!currentUser) return null;
  const isAdmin = currentUser.role === "ADMIN";
  const isManager = currentUser.role === "MANAGER";

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  function canEdit(u: AppUser) {
    if (isAdmin) return true;
    // A Manager is the admin for their own (hotel, department) pair — they can
    // only edit the Staff already inside it, never another Manager or Admin.
    return isManager && u.role === "STAFF";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-ink-100">Users</h2>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!referenceDataReady}
          className="btn-primary"
          title={referenceDataReady ? undefined : "Loading hotels and departments..."}
        >
          Add user
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-4">
        {isAdmin ? "Everyone with access to the system." : "Staff in your department at your hotel."}
      </p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Hotel</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {usersQuery.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 font-medium text-ink-100">{u.name}</td>
                <td className="px-4 py-2 text-ink-500">{u.email}</td>
                <td className="px-4 py-2 text-ink-500">{u.role}</td>
                <td className="px-4 py-2 text-ink-500 font-mono">{hotelCode(u.hotelId)}</td>
                <td className="px-4 py-2 text-right">
                  {canEdit(u) && (
                    <button onClick={() => setEditingUser(u)} className="btn-ghost text-xs px-2.5 py-1.5">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          currentUser={currentUser}
          hotels={hotelsQuery.data ?? []}
          departments={departmentsQuery.data ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidateUsers();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          currentUser={currentUser}
          targetUser={editingUser}
          hotels={hotelsQuery.data ?? []}
          departments={departmentsQuery.data ?? []}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            invalidateUsers();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  currentUser,
  hotels,
  departments,
  onClose,
  onCreated,
}: {
  currentUser: { role: Role; hotelId: string | null; departmentId: string | null };
  hotels: Hotel[];
  departments: Department[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const isAdmin = currentUser.role === "ADMIN";
  const { selectedDepartmentId } = useDepartmentScope();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [hotelId, setHotelId] = useState(isAdmin ? hotels[0]?.id ?? "" : currentUser.hotelId ?? "");
  const [departmentId, setDepartmentId] = useState(
    isAdmin ? selectedDepartmentId || departments[0]?.id || "" : currentUser.departmentId ?? ""
  );

  // A Manager may only ever create Staff users in their own hotel and department —
  // mirrors the restriction the backend enforces, so the form can't promise something it will reject.
  const effectiveRole = isAdmin ? role : "STAFF";
  const effectiveHotelId = isAdmin ? hotelId : currentUser.hotelId ?? "";
  const effectiveDepartmentId = isAdmin ? departmentId : currentUser.departmentId ?? "";

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/users", {
        name,
        email,
        password,
        role: effectiveRole,
        hotelId: effectiveRole === "ADMIN" ? null : effectiveHotelId,
        departmentId: effectiveDepartmentId,
      }),
    onSuccess: onCreated,
  });

  const errorMessage = createMutation.error instanceof Error ? createMutation.error.message : null;

  return (
    <Modal title="Add user" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Temporary password">
          <PasswordInput
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </Field>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field">
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager (department + property admin)</option>
                <option value="ADMIN">Admin (full organization access)</option>
              </select>
            </Field>
            <Field label="Department">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="input-field"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            New users you create are always Staff, in your hotel and department.
          </p>
        )}

        {isAdmin && effectiveRole !== "ADMIN" && (
          <Field label="Hotel (property)">
            <select value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="input-field">
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code}
                </option>
              ))}
            </select>
          </Field>
        )}

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel="Create" />
      </form>
    </Modal>
  );
}

function EditUserModal({
  currentUser,
  targetUser,
  hotels,
  departments,
  onClose,
  onSaved,
}: {
  currentUser: { role: Role; hotelId: string | null; departmentId: string | null };
  targetUser: AppUser;
  hotels: Hotel[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isAdmin = currentUser.role === "ADMIN";

  const [name, setName] = useState(targetUser.name);
  const [role, setRole] = useState<Role>(targetUser.role);
  const [hotelId, setHotelId] = useState(targetUser.hotelId ?? hotels[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(targetUser.departmentId ?? departments[0]?.id ?? "");
  const [newPassword, setNewPassword] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/users/${targetUser.id}`, {
        name,
        // A Manager can't change role/hotel/department — send the unchanged
        // values so the backend sees "no change requested" for those fields.
        role: isAdmin ? role : targetUser.role,
        hotelId: isAdmin ? (role === "ADMIN" ? null : hotelId) : targetUser.hotelId,
        departmentId: isAdmin ? departmentId : targetUser.departmentId,
        ...(newPassword ? { password: newPassword } : {}),
      }),
    onSuccess: onSaved,
  });

  const errorMessage = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const hotelName = hotels.find((h) => h.id === targetUser.hotelId)?.code ?? "—";
  const departmentName = departments.find((d) => d.id === targetUser.departmentId)?.name ?? "—";

  return (
    <Modal title={`Edit user · ${targetUser.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label="Email">
          <input value={targetUser.email} disabled className="input-field opacity-60 cursor-not-allowed" />
        </Field>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field">
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager (department + property admin)</option>
                <option value="ADMIN">Admin (full organization access)</option>
              </select>
            </Field>
            <Field label="Department">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="input-field"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <Field label="Role · Department">
            <p className="text-sm text-ink-300">
              Staff · {departmentName} — as their Manager, you can't change a user's role or move them elsewhere.
            </p>
          </Field>
        )}

        {isAdmin && role !== "ADMIN" && (
          <Field label="Hotel (property)">
            <select value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="input-field">
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!isAdmin && (
          <Field label="Hotel (property)">
            <p className="text-sm text-ink-300 font-mono">{hotelName}</p>
          </Field>
        )}

        <Field label="Reset password (optional)">
          <PasswordInput
            minLength={8}
            placeholder="Leave blank to keep current password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-field"
          />
        </Field>

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
        <ModalActions onClose={onClose} submitting={saveMutation.isPending} submitLabel="Save changes" />
      </form>
    </Modal>
  );
}
