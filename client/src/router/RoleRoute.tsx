import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const ROLE_REDIRECTS: Record<string, string> = {
  admin: '/admin',
  customer: '/customer/services',
  staff: '/staff/job-carts',
};

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

/**
 * RoleRoute — Wraps a route segment that requires specific role(s).
 * If the user's role isn't in `allowedRoles`, redirects them to the
 * correct dashboard for their actual role.
 */
export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_REDIRECTS[user.role] || '/login'} replace />;
  }

  return <>{children}</>;
}
