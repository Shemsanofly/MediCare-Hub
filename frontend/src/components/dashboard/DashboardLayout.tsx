import { Outlet } from 'react-router-dom';

import { useAppSelector } from '@/hooks/useAppStore';
import Sidebar, { type NavItem } from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';
import type { UserRole } from '@/types';

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  HOSPITAL: [
    { label: 'Dashboard', to: '/hospital/dashboard', end: true },
    { label: 'Marketplace', to: '/marketplace' },
    { label: 'Cart', to: '/hospital/cart' },
    { label: 'Checkout', to: '/hospital/checkout' },
  ],
  SUPPLIER: [
    { label: 'Dashboard', to: '/supplier/dashboard', end: true },
    { label: 'My Products', to: '/supplier/products' },
    { label: 'Add Product', to: '/supplier/products/new' },
    { label: 'Orders', to: '/supplier/orders' },
  ],
  ADMIN: [
    { label: 'Dashboard', to: '/admin/dashboard', end: true },
    { label: 'Users', to: '/admin/users' },
    { label: 'Suppliers', to: '/admin/suppliers' },
    { label: 'Products', to: '/admin/products' },
    { label: 'Orders', to: '/admin/orders' },
  ],
};

interface DashboardLayoutProps {
  title?: string;
}

const DashboardLayout = ({ title }: DashboardLayoutProps) => {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) {
    return null;
  }

  const navItems = NAV_BY_ROLE[user.role] ?? [];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role={user.role} items={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={title} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
