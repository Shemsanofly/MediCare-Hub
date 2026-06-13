import { Navigate } from 'react-router-dom';

import { useAppSelector } from '@/hooks/useAppStore';
import { getDashboardPath } from '@/utils/routing';

/** Redirect authenticated users to their role dashboard, others to login. */
const HomePage = () => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDashboardPath(user.role)} replace />;
};

export default HomePage;
