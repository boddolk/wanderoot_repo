import { ForbiddenError } from '../shared/errors';

export enum Role {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

/** Дозволи, які перевіряються перед виконанням захищених операцій. */
export enum Permission {
  CREATE_ROUTE = 'route:create',
  MODERATE_CONTENT = 'content:moderate',
  APPROVE_POI = 'poi:approve',
  MANAGE_USERS = 'user:manage',
}

/**
 * Ієрархія ролей: кожна роль отримує всі дозволи попередньої,
 * тому адміністратор автоматично має можливості модератора.
 */
const OWN: Record<Role, Permission[]> = {
  [Role.USER]: [Permission.CREATE_ROUTE],
  [Role.MODERATOR]: [Permission.MODERATE_CONTENT, Permission.APPROVE_POI],
  [Role.ADMIN]: [Permission.MANAGE_USERS],
};
const ORDER = [Role.USER, Role.MODERATOR, Role.ADMIN];

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = Object.fromEntries(
  ORDER.map((role, i) => [role, new Set(ORDER.slice(0, i + 1).flatMap((r) => OWN[r]))]),
) as unknown as Record<Role, ReadonlySet<Permission>>;

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.has(permission) ?? false;
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError('Недостатньо повноважень для виконання операції');
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (Object.values(Role) as string[]).includes(value);
}
