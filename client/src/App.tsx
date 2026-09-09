import { Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { HotelScopeProvider } from "./context/HotelScopeContext";
import { DepartmentScopeProvider } from "./context/DepartmentScopeContext";
import { Layout } from "./components/Layout";
import { RoleGate } from "./components/RoleGate";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { PurchaseRequests } from "./pages/PurchaseRequests";
import { WorkOrders } from "./pages/WorkOrders";
import { SettingsIndex, SettingsLayout } from "./pages/settings/SettingsLayout";
import { ProfileSettings } from "./pages/settings/Profile";
import { SecuritySettings } from "./pages/settings/Security";
import { OrgHotels } from "./pages/settings/OrgHotels";
import { OrgUsers } from "./pages/settings/OrgUsers";
import { OrgCategories } from "./pages/settings/OrgCategories";
import { OrgDepartments } from "./pages/settings/OrgDepartments";
import { RolesPermissions } from "./pages/settings/RolesPermissions";
import { DataExport } from "./pages/settings/DataExport";
import { ComingSoon } from "./pages/settings/ComingSoon";

function ProtectedApp() {
  return (
    <HotelScopeProvider>
      <DepartmentScopeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="purchase-requests" element={<PurchaseRequests />} />
          <Route path="work-orders" element={<WorkOrders />} />

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
                <RoleGate roles={["ADMIN", "MANAGER"]}>
                  <OrgUsers />
                </RoleGate>
              }
            />
            <Route
              path="organization/categories"
              element={
                <RoleGate roles={["ADMIN", "MANAGER"]}>
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
            <Route path="roles" element={<RolesPermissions />} />
            <Route
              path="data"
              element={
                <RoleGate roles={["ADMIN", "MANAGER"]}>
                  <DataExport />
                </RoleGate>
              }
            />
            <Route
              path="notifications"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <ComingSoon
                    title="Notifications"
                    description="Email and in-app alerts for low stock and pending approvals are planned but not wired up yet — this needs an email provider configured first."
                  />
                </RoleGate>
              }
            />
            <Route
              path="appearance"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <ComingSoon
                    title="Appearance"
                    description="Property Inventory currently ships as a single dark theme by design. A configurable theme is not planned in the near term."
                  />
                </RoleGate>
              }
            />
            <Route
              path="language"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <ComingSoon
                    title="Language & region"
                    description="The interface is English-only today. Localization would need translated strings and a language switcher, neither of which exist yet."
                  />
                </RoleGate>
              }
            />
            <Route
              path="communications"
              element={
                <RoleGate roles={["ADMIN"]}>
                  <ComingSoon
                    title="Communications"
                    description="No email or SMS provider is connected yet, so there's nowhere for outbound messages (receipts, digests, alerts) to send from."
                  />
                </RoleGate>
              }
            />
          </Route>
        </Route>
      </Routes>
      </DepartmentScopeProvider>
    </HotelScopeProvider>
  );
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return <ProtectedApp />;
}
