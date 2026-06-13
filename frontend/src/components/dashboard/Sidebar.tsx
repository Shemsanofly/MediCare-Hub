import { NavLink } from 'react-router-dom';

import type { UserRole } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  end?: boolean;
}

interface SidebarProps {
  role: UserRole;
  items: NavItem[];
}

const roleLabels: Record<UserRole, string> = {
  HOSPITAL: 'Hospital Portal',
  SUPPLIER: 'Supplier Portal',
  ADMIN: 'Admin Console',
};

const Sidebar = ({ role, items }: SidebarProps) => (
  <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:block">
    <div className="border-b border-gray-100 px-5 py-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        MediCare Hub
      </p>
      <p className="mt-1 text-sm font-medium text-gray-700">{roleLabels[role]}</p>
    </div>
    <nav className="space-y-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:bg-primary-50 hover:text-primary'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  </aside>
);

export default Sidebar;
