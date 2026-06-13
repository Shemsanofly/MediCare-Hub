import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/types';

interface TopbarProps {
  user: User;
  title?: string;
}

const Topbar = ({ user, title }: TopbarProps) => {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-lg font-semibold text-gray-900">
            {title ?? 'Dashboard'}
          </p>
          <p className="text-sm text-gray-500">
            Welcome, {user.full_name || user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-primary-50 px-3 py-1 text-xs font-medium capitalize text-primary sm:inline">
            {user.role.toLowerCase()}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
