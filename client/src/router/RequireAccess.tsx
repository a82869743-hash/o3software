import { useAuthStore } from '../store/authStore';
import { can } from '../utils/access';
import NoAccessPage from '../pages/shared/NoAccessPage';

interface Props {
  module: string;
  action?: string;
  children: React.ReactNode;
}

/** Renders the page only when the signed-in user has module.action; otherwise the No Access screen. */
export default function RequireAccess({ module, action = 'view', children }: Props) {
  const user = useAuthStore((s) => s.user);
  if (!can(user, module, action)) return <NoAccessPage />;
  return <>{children}</>;
}
