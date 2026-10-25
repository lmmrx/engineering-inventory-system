import { Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { HotelScopeProvider } from "./context/HotelScopeContext";
import { DepartmentScopeProvider } from "./context/DepartmentScopeContext";
import { Layout } from "./components/Layout";
import { RoleGate } from "./components/RoleGate";
import { Spinner } from "./components/Spinner";
import { useT } from "./i18n";
import { useTakingLong } from "./hooks/useTakingLong";
import zsHoldingsLogo from "./assets/logo-zsholdings.png";
import { Login } from "./pages/Login";
import { ForcePasswordChange } from "./pages/ForcePasswordChange";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { PurchaseRequests } from "./pages/PurchaseRequests";
import { WorkOrders } from "./pages/WorkOrders";
import { Analytics } from "./pages/Analytics";
import { SettingsIndex, SettingsLayout } from "./pages/settings/SettingsLayout";
import { ProfileSettings } from "./pages/settings/Profile";
import { SecuritySettings } from "./pages/settings/Security";
import { OrgHotels } from "./pages/settings/OrgHotels";
import { OrgUsers } from "./pages/settings/OrgUsers";
import { OrgCategories } from "./pages/settings/OrgCategories";
import { OrgDepartments } from "./pages/settings/OrgDepartments";
import { RolesPermissions } from "./pages/settings/RolesPermissions";
import { DataExport } from "./pages/settings/DataExport";
import { AuditLog } from "./pages/settings/AuditLog";
import { ComingSoon } from "./pages/settings/ComingSoon";
import { AppearanceSettings } from "./pages/settings/Appearance";
import { LanguageSettings } from "./pages/settings/Language";

function ProtectedApp() {
  const t = useT();
  return (
    <HotelScopeProvider>
      <DepartmentScopeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="purchase-requests" element={<PurchaseRequests />} />
          <Route path="work-orders" element={<WorkOrders />} />
          <Route
            path="analytics"
            element={
              <RoleGate permission="view_analytics">
                <Analytics />
              </RoleGate>
            }
          />

          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsIndex />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route
              path="organization/hotels"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <OrgHotels />
                </RoleGate>
              }
            />
            <Route
              path="organization/users"
              element={
                <RoleGate permission="manage_staff">
                  <OrgUsers />
                </RoleGate>
              }
            />
            <Route
              path="organization/categories"
              element={
                <RoleGate permission="manage_categories">
                  <OrgCategories />
                </RoleGate>
              }
            />
            <Route
              path="organization/departments"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <OrgDepartments />
                </RoleGate>
              }
            />
            <Route
              path="roles"
              element={
                <RoleGate roles={["ADMIN", "MANAGER", "SUPERVISOR"]}>
                  <RolesPermissions />
                </RoleGate>
              }
            />
            <Route
              path="data"
              element={
                <RoleGate permission="reports">
                  <DataExport />
                </RoleGate>
              }
            />
            <Route
              path="audit-log"
              element={
                <RoleGate permission="audit_log">
                  <AuditLog />
                </RoleGate>
              }
            />
            <Route path="profile/appearance" element={<AppearanceSettings />} />
            <Route path="profile/language" element={<LanguageSettings />} />
            <Route
              path="profile/notifications"
              element={
                <ComingSoon title={t("settings.notifications")} description={t("notifications.description")} />
              }
            />
            <Route
              path="profile/communications"
              element={
                <ComingSoon title={t("settings.communications")} description={t("communications.description")} />
              }
            />
          </Route>
        </Route>
      </Routes>
      </DepartmentScopeProvider>
    </HotelScopeProvider>
  );
}

function LoadingScreen() {
  const t = useT();
  const takingLong = useTakingLong(true);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-14 w-auto" />
      <div className="flex items-center gap-2 text-sm text-ink-500" aria-live="polite">
        <Spinner />
        {t("common.loading")}
      </div>
      {takingLong && (
        <p className="text-xs text-ink-500 max-w-xs">
          {t("login.waking")}
        </p>
      )}
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <ProtectedApp />;
}
