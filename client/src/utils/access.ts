import type { User } from '../types';

/**
 * Client-side mirror of the server permission model. The server is the real gate —
 * this only decides what to SHOW (menus, buttons, pages).
 */
export const INTERNAL_ROLES = ['super_admin', 'admin', 'manager', 'staff'] as const;

export function isInternal(user?: User | null) {
  return !!user && (INTERNAL_ROLES as readonly string[]).includes(user.role);
}

export function can(user: User | null | undefined, module: string, action: string = 'view'): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return !!user.permissions?.includes(`${module}.${action}`);
}

export function canAny(user: User | null | undefined, module: string): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return !!user.permissions?.some(p => p.startsWith(`${module}.`));
}

/** First page an internal user is allowed to open (used after login and on 403). */
export function landingPath(user: User | null | undefined): string {
  if (!user) return '/login';
  if (user.role === 'customer') return '/customer';
  const order: Array<[string, string]> = [
    ['dashboard', '/admin'],
    ['job_cards', '/admin/job-carts'],
    ['quick_wash', '/admin/quick-wash'],
    ['bookings', '/admin/customer-bookings'],
    ['deliveries', '/admin/deliveries'],
    ['customers', '/admin/customers'],
  ];
  for (const [mod, path] of order) if (can(user, mod)) return path;
  return '/admin/my/attendance';
}
