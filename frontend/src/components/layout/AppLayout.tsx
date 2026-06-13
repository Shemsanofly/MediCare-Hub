import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router-dom';

import { notificationsApi, ordersApi } from '@/api';
import { useAppSelector } from '@/hooks/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardPath } from '@/utils/routing';



/** Shared application shell with navigation and content outlet. */

const AppLayout = () => {

  const { user } = useAppSelector((state) => state.auth);

  const { logout } = useAuth();

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const { data } = await ordersApi.getCart();
      return data;
    },
    enabled: user?.role === 'HOSPITAL',
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await notificationsApi.listNotifications();
      return data.results ?? [];
    },
  });

  const cartCount = cartQuery.data?.item_count ?? 0;
  const unreadCount = notificationsQuery.data?.filter((n) => !n.read).length ?? 0;



  return (

    <div className="min-h-screen bg-gray-50">

      <header className="border-b border-gray-200 bg-white shadow-sm">

        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">

          <Link to={user ? getDashboardPath(user.role) : '/'} className="text-xl font-bold text-primary">

            MediCare Hub

          </Link>



          <nav className="flex items-center gap-6 text-sm font-medium text-gray-600">

            {user?.role === 'HOSPITAL' && (
              <>
                <Link to="/marketplace" className="hover:text-primary">
                  Catalog
                </Link>
                <Link to="/hospital/cart" className="hover:text-primary">
                  Cart ({cartCount})
                </Link>
              </>
            )}

            {user && (

              <span className="capitalize text-gray-800">

                {user.full_name || user.email}

                {' '}

                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary">

                  {user.role}

                </span>

              </span>

            )}

            <span className="text-secondary">
              Notifications ({unreadCount})
            </span>

            <button

              type="button"

              onClick={() => void logout()}

              className="rounded-md bg-primary px-3 py-1.5 text-white transition hover:bg-primary-600"

            >

              Sign out

            </button>

          </nav>

        </div>

      </header>



      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <Outlet />

      </main>

    </div>

  );

};



export default AppLayout;

