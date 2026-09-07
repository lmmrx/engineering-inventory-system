import { NavLink, Outlet } from "react-router-dom";
import { Footer } from "./Footer";
import { UserMenu } from "./UserMenu";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
    isActive ? "bg-gold-500/15 text-gold-300" : "text-ink-300 hover:bg-navy-800 hover:text-ink-100"
  }`;

export function Layout() {
  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-navy-950/95 backdrop-blur border-b border-navy-800">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center gap-2">
          <div className="flex items-center gap-2 flex-none pr-6">
            <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-7 w-auto flex-none" />
            <span className="font-semibold text-ink-100 whitespace-nowrap hidden sm:inline pl-1.5">
              Engineering Inventory
            </span>
          </div>

          <nav className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto mx-2">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/inventory" className={navLinkClass}>
              Inventory
            </NavLink>
            <NavLink to="/purchase-requests" className={navLinkClass}>
              Purchase Requests
            </NavLink>
            <NavLink to="/work-orders" className={navLinkClass}>
              Work Orders
            </NavLink>
          </nav>

          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 flex-1 w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
