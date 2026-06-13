import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth, useAuthInit } from '@/hooks/useAuth';
import type { UserRole } from '@/types';
import { getDashboardPath } from '@/utils/routing';

interface ProtectedRouteProps {
  requiredRole?: UserRole | UserRole[];
  children?: React.ReactNode;
}

/**
 * Guard routes requiring authentication and optional role-based access.
 * Redirects unauthenticated users to /login with returnUrl.
 */
const ProtectedRoute = ({ requiredRole, children }: ProtectedRouteProps) => {
  useAuthInit();
  const location = useLocation();
  const { isAuthenticated, role, isLoading, sessionRestored, user } = useAuth();

  if (!sessionRestored || isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (role && !allowedRoles.includes(role)) {
      return <Navigate to={getDashboardPath(role)} replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
