import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: '/admin',
  admin: '/admin',
  manager: '/admin',
  customer: '/customer',
  staff: '/staff/job-carts',
};

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

/**
 * RoleRoute — Wraps a route segment requiring specific role(s).
 * - super_admin inherits access to all internal operational and admin routes.
 * - manager inherits access to admin routes where operations are conducted.
 */
export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Super admin can access all admin routes
  if (user.role === 'super_admin' && (allowedRoles.includes('admin') || allowedRoles.includes('super_admin'))) {
    return <>{children}</>;
  }

  // Manager has operational admin layout access
  if (user.role === 'manager' && (allowedRoles.includes('admin') || allowedRoles.includes('manager'))) {
    return <>{children}</>;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_REDIRECTS[user.role] || '/login'} replace />;
  }

  return <>{children}</>;
}
