import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { AppUser, Department, Hotel, MIN_PASSWORD_LENGTH, Role } from "../../types";
import { Field, Modal, ModalActions } from "../../components/Modal";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { useLocale, useT } from "../../i18n";

export function OrgUsers() {
  const { user: currentUser } = useAuth();
  const t = useT();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<AppUser[]>("/users") });
  const [actionError, setActionError] = useState<string | null>(null);
  const accountAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "disable" | "enable" | "unlock" }) =>
      api.post<AppUser>(`/users/${id}/${action}`),
    onMutate: () => setActionError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (err) => setActionError(err instanceof Error && err.message ? err.message : t("users.actionFailed")),
  });
  const hotelsQuery = useQuery({ queryKey: ["hotels"], queryFn: () => api.get<Hotel[]>("/hotels") });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments") });

  const hotelCode = (id: string | null) => hotelsQuery.data?.find((h) => h.id === id)?.code ?? t("menu.allHotels");
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
        <h2 className="font-semibold text-ink-100">{t("settings.users")}</h2>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!referenceDataReady}
          className="btn-primary"
          title={referenceDataReady ? undefined : t("users.loadingRefs")}
        >
          {t("users.add")}
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-4">
        {isAdmin ? t("users.descAdmin") : t("users.descManager")}
      </p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("field.name")}</th>
              <th className="px-4 py-2">{t("field.email")}</th>
              <th className="px-4 py-2">{t("field.role")}</th>
              <th className="px-4 py-2">{t("inv.col.hotel")}</th>
              <th className="px-4 py-2">{t("users.col.status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {usersQuery.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 font-medium text-ink-100">{u.name}</td>
                <td className="px-4 py-2 text-ink-500">{u.email}</td>
                <td className="px-4 py-2 text-ink-500">{t(`roleName.${u.role}`)}</td>
                <td className="px-4 py-2 text-ink-500 font-mono">{hotelCode(u.hotelId)}</td>
                <td className="px-4 py-2">
                  <AccountStatus user={u} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    {/* Lifting a lockout early is Admin-only: a lock usually means someone was guessing the password. */}
                    {isAdmin && isLocked(u) && (
                      <button
                        onClick={() => accountAction.mutate({ id: u.id, action: "unlock" })}
                        disabled={accountAction.isPending}
                        className="btn-ghost text-xs px-2.5 py-1.5"
                      >
                        {t("users.unlock")}
                      </button>
                    )}
                    {canEdit(u) && u.id !== currentUser.id && (
                      <button
                        onClick={() => {
                          if (u.disabledAt || window.confirm(t("users.disableConfirm", { name: u.name }))) {
                            accountAction.mutate({ id: u.id, action: u.disabledAt ? "enable" : "disable" });
                          }
                        }}
                        disabled={accountAction.isPending}
                        className="btn-ghost text-xs px-2.5 py-1.5"
                      >
                        {u.disabledAt ? t("users.enable") : t("users.disable")}
                      </button>
                    )}
                    {canEdit(u) && (
                      <button onClick={() => setEditingUser(u)} className="btn-ghost text-xs px-2.5 py-1.5">
                        {t("common.edit")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {actionError && <p className="text-sm text-rose-400 mt-3">{actionError}</p>}

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
  const t = useT();
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
    <Modal title={t("users.add")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label={t("field.name")}>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label={t("field.email")}>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label={t("users.tempPassword")}>
          <TemporaryPasswordField
            required
            value={password}
            onChange={setPassword}
            placeholder={t("users.tempPlaceholder", { min: MIN_PASSWORD_LENGTH })}
          />
          <p className="text-xs text-ink-500 mt-1">{t("users.tempHint")}</p>
        </Field>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("field.role")}>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field">
                <option value="STAFF">{t("users.optionSTAFF")}</option>
                <option value="MANAGER">{t("users.optionMANAGER")}</option>
                <option value="ADMIN">{t("users.optionADMIN")}</option>
              </select>
            </Field>
            <Field label={t("field.department")}>
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
            {t("users.managerCreatesStaff")}
          </p>
        )}

        {isAdmin && effectiveRole !== "ADMIN" && (
          <Field label={t("field.hotel")}>
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
        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel={t("common.create")} />
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
  const t = useT();

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
    <Modal title={t("users.editTitle", { name: targetUser.name })} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label={t("field.name")}>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label={t("field.email")}>
          <input value={targetUser.email} disabled className="input-field opacity-60 cursor-not-allowed" />
        </Field>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("field.role")}>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field">
                <option value="STAFF">{t("users.optionSTAFF")}</option>
                <option value="MANAGER">{t("users.optionMANAGER")}</option>
                <option value="ADMIN">{t("users.optionADMIN")}</option>
              </select>
            </Field>
            <Field label={t("field.department")}>
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
          <Field label={t("users.roleDepartment")}>
            <p className="text-sm text-ink-300">
              {t("users.managerLimits", { department: departmentName })}
            </p>
          </Field>
        )}

        {isAdmin && role !== "ADMIN" && (
          <Field label={t("field.hotel")}>
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
          <Field label={t("field.hotel")}>
            <p className="text-sm text-ink-300 font-mono">{hotelName}</p>
          </Field>
        )}

        <Field label={t("users.resetPassword")}>
          <TemporaryPasswordField
            value={newPassword}
            onChange={setNewPassword}
            placeholder={t("users.resetPlaceholder")}
          />
          {newPassword && (
            <p className="text-xs text-ink-500 mt-1">
              {t("users.resetHint")}
            </p>
          )}
        </Field>

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
        <ModalActions onClose={onClose} submitting={saveMutation.isPending} submitLabel={t("common.saveChanges")} />
      </form>
    </Modal>
  );
}

function isLocked(u: AppUser) {
  return !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
}

function AccountStatus({ user }: { user: AppUser }) {
  const t = useT();
  const locale = useLocale();
  if (user.disabledAt) return <span className="text-xs text-ink-500">{t("users.disabled")}</span>;
  if (isLocked(user)) {
    const until = new Date(user.lockedUntil!).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    return <span className="text-xs text-rose-400">{t("users.lockedUntil", { time: until })}</span>;
  }
  if (user.mustChangePassword) return <span className="text-xs text-amber-400">{t("users.mustChange")}</span>;
  return <span className="text-xs text-emerald-400">{t("users.active")}</span>;
}
