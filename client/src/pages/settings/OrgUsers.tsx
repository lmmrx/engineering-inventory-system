import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import {
  AppUser,
  CurrentUser,
  Department,
  GRANTABLE_PERMISSIONS,
  Hotel,
  MIN_PASSWORD_LENGTH,
  Permission,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  Role,
  can,
} from "../../types";
import { Field, Modal, ModalActions } from "../../components/Modal";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { useLocale, useT } from "../../i18n";

const ALL_ROLES: Role[] = ["STAFF", "SUPERVISOR", "MANAGER", "ADMIN"];

/** The roles the signed-in user may give: Admins any; everyone else only roles below their own. */
function assignableRoles(me: CurrentUser) {
  return me.role === "ADMIN" ? ALL_ROLES : ALL_ROLES.filter((r) => ROLE_RANK[r] < ROLE_RANK[me.role]);
}

/** Whether the signed-in user may manage this account (the server checks the same). */
function canManage(me: CurrentUser, u: AppUser) {
  if (me.role === "ADMIN") return true;
  return ROLE_RANK[u.role] < ROLE_RANK[me.role] && u.hotelId === me.hotelId && u.departmentId === me.departmentId;
}

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

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: ["users"] });
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
      <p className="text-sm text-ink-500 mb-4">{isAdmin ? t("users.descAdmin") : t("users.descScoped")}</p>
      <div className="table-shell">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("field.name")}</th>
              <th className="px-4 py-2">{t("field.role")}</th>
              <th className="px-4 py-2">{t("profile.manager")}</th>
              <th className="px-4 py-2">{t("inv.col.hotel")}</th>
              <th className="px-4 py-2">{t("users.col.status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {usersQuery.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <p className="font-medium text-ink-100">{u.name}</p>
                  <p className="text-xs text-ink-500">{u.position ? `${u.position} · ${u.email}` : u.email}</p>
                </td>
                <td className="px-4 py-2 text-ink-500 whitespace-nowrap">
                  {t(`roleName.${u.role}`)}
                  {(u.extraPermissions?.length ?? 0) > 0 && (
                    <span
                      className="ms-1.5 text-xs text-gold-400"
                      title={u.extraPermissions!.map((p) => t(`perm.${p}`)).join(", ")}
                    >
                      {t("users.extraCount", { count: u.extraPermissions!.length })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-500">{u.manager?.name ?? "—"}</td>
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
                    {canManage(currentUser, u) && u.id !== currentUser.id && (
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
                    {canManage(currentUser, u) && (
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
        <UserModal
          currentUser={currentUser}
          hotels={hotelsQuery.data ?? []}
          departments={departmentsQuery.data ?? []}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            invalidateUsers();
          }}
        />
      )}

      {editingUser && (
        <UserModal
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

/** Adds a user, or edits one when `targetUser` is given. */
function UserModal({
  currentUser,
  targetUser,
  hotels,
  departments,
  onClose,
  onSaved,
}: {
  currentUser: CurrentUser;
  targetUser?: AppUser;
  hotels: Hotel[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isAdmin = currentUser.role === "ADMIN";
  const editing = !!targetUser;
  const { selectedDepartmentId } = useDepartmentScope();
  const roles = assignableRoles(currentUser);

  const [name, setName] = useState(targetUser?.name ?? "");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState(targetUser?.position ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(targetUser?.role ?? "STAFF");
  const [hotelId, setHotelId] = useState(
    targetUser?.hotelId ?? (isAdmin ? hotels[0]?.id ?? "" : currentUser.hotelId ?? "")
  );
  const [departmentId, setDepartmentId] = useState(
    targetUser?.departmentId ?? (isAdmin ? selectedDepartmentId || departments[0]?.id || "" : currentUser.departmentId ?? "")
  );
  const [managerId, setManagerId] = useState(targetUser?.manager?.id ?? "");
  const [extras, setExtras] = useState<Permission[]>(targetUser?.extraPermissions ?? []);

  // Below Admin, accounts always stay in your own hotel and department.
  const effectiveHotelId = role === "ADMIN" ? null : isAdmin ? hotelId : currentUser.hotelId;
  const effectiveDepartmentId = isAdmin ? departmentId : currentUser.departmentId;

  const managersQuery = useQuery({
    queryKey: ["manager-options", role, effectiveHotelId, targetUser?.id],
    queryFn: () => {
      const params = new URLSearchParams({ role });
      if (effectiveHotelId) params.set("hotelId", effectiveHotelId);
      if (targetUser) params.set("excludeId", targetUser.id);
      return api.get<{ id: string; name: string }[]>(`/users/manager-options?${params}`);
    },
  });
  // A manager who no longer fits the chosen role or hotel is dropped from the form.
  const managerOptions = managersQuery.data ?? [];
  const chosenManager = managerOptions.some((m) => m.id === managerId) ? managerId : "";

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name,
        position,
        role,
        hotelId: effectiveHotelId,
        departmentId: effectiveDepartmentId,
        managerId: chosenManager || null,
        extraPermissions: extras,
      };
      return editing
        ? api.patch(`/users/${targetUser!.id}`, { ...body, ...(password ? { password } : {}) })
        : api.post("/users", { ...body, email, password });
    },
    onSuccess: onSaved,
  });

  const errorMessage = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const departmentName = departments.find((d) => d.id === effectiveDepartmentId)?.name ?? "—";
  const hotelCode = hotels.find((h) => h.id === effectiveHotelId)?.code ?? "—";
  const included = new Set(ROLE_PERMISSIONS[role]);

  return (
    <Modal
      title={editing ? t("users.editTitle", { name: targetUser!.name }) : t("users.add")}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label={t("field.name")}>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" maxLength={100} />
        </Field>
        {editing ? (
          <Field label={t("field.email")}>
            <input value={targetUser!.email} disabled className="input-field opacity-60 cursor-not-allowed" />
          </Field>
        ) : (
          <Field label={t("field.email")}>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
          </Field>
        )}
        <Field label={t("profile.position")}>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t("profile.positionPlaceholder")}
            className="input-field"
            maxLength={100}
          />
        </Field>

        {!editing && (
          <Field label={t("users.tempPassword")}>
            <TemporaryPasswordField
              required
              value={password}
              onChange={setPassword}
              placeholder={t("users.tempPlaceholder", { min: MIN_PASSWORD_LENGTH })}
            />
            <p className="text-xs text-ink-500 mt-1">{t("users.tempHint")}</p>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("field.role")}>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`users.option${r}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("profile.manager")}>
            <select value={chosenManager} onChange={(e) => setManagerId(e.target.value)} className="input-field">
              <option value="">{t("profile.noManager")}</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("field.department")}>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="input-field">
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            {role !== "ADMIN" && (
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
          </div>
        ) : (
          <p className="text-xs text-ink-500">{t("users.scopeLocked", { department: departmentName, hotel: hotelCode })}</p>
        )}

        {role !== "ADMIN" && (
          <fieldset className="rounded-md border border-navy-700 px-3 py-2.5">
            <legend className="px-1 text-sm font-medium text-ink-300">{t("users.extraPermissions")}</legend>
            <p className="text-xs text-ink-500 mb-2">{t("users.extraHint", { role: t(`roleName.${role}`) })}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {GRANTABLE_PERMISSIONS.map((p) => {
                const inRole = included.has(p);
                // You can only grant what you have yourself.
                const mayGrant = can(currentUser, p);
                return (
                  <label
                    key={p}
                    className={`flex items-start gap-2 text-sm ${inRole || !mayGrant ? "text-ink-500" : "text-ink-200"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-gold-500"
                      checked={inRole || extras.includes(p)}
                      disabled={inRole || !mayGrant}
                      onChange={(e) =>
                        setExtras((current) => (e.target.checked ? [...current, p] : current.filter((x) => x !== p)))
                      }
                    />
                    <span>
                      {t(`perm.${p}`)}
                      {inRole && <span className="block text-xs">{t("users.includedInRole")}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {editing && (
          <Field label={t("users.resetPassword")}>
            <TemporaryPasswordField value={password} onChange={setPassword} placeholder={t("users.resetPlaceholder")} />
            {password && <p className="text-xs text-ink-500 mt-1">{t("users.resetHint")}</p>}
          </Field>
        )}

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
        <ModalActions
          onClose={onClose}
          submitting={saveMutation.isPending}
          submitLabel={editing ? t("common.saveChanges") : t("common.create")}
        />
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
