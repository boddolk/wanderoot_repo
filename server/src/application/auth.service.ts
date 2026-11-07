import { AuthError, ConflictError, ForbiddenError, NotFoundError } from '../domain/shared/errors';
import { Permission, Role, assertCan, isRole } from '../domain/users/role';
import { User } from '../domain/users/user';
import { Clock, EventBus, PasswordHasher, TokenService, UserRepository } from './ports';

export interface AuthResult {
  token: string;
  user: ReturnType<User['toPublic']>;
}

/** Реєстрація, вхід, перевірка токена та адміністрування користувачів. */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  register(data: { login: string; email: string; password: string; displayName?: string }): AuthResult {
    User.validateLogin(data.login);
    User.validatePassword(data.password);
    const user = User.register({ ...data, passwordHash: this.hasher.hash(data.password), now: this.clock.now() });
    if (this.users.existsByLoginOrEmail(user.login, user.email)) throw new ConflictError('Користувач з таким логіном або email уже існує');
    this.users.save(user);
    return this.issue(user);
  }

  login(login: string, password: string): AuthResult {
    const user = this.users.findByLogin((login ?? '').trim());
    const now = this.clock.now();
    if (!user) throw new AuthError('Невірний логін або пароль');
    if (user.status === 'BLOCKED') throw new ForbiddenError('Обліковий запис заблоковано');
    if (user.isLocked(now)) throw new ForbiddenError('Забагато невдалих спроб входу. Спробуйте пізніше');
    if (!this.hasher.verify(password ?? '', user.passwordHash)) {
      user.registerFailedLogin(now);
      this.users.save(user);
      throw new AuthError('Невірний логін або пароль');
    }
    user.registerSuccessfulLogin();
    this.users.save(user);
    return this.issue(user);
  }

  /** Повертає актуального користувача за токеном (роль і статус беруться з БД, а не з токена). */
  authenticate(token: string): User {
    const payload = this.tokens.verify(token);
    const user = this.users.findById(payload.sub);
    if (!user) throw new AuthError('Користувача не знайдено');
    if (user.isTokenRevoked(payload.ver)) throw new AuthError('Пароль було змінено. Увійдіть знову');
    if (user.status === 'BLOCKED') throw new ForbiddenError('Обліковий запис заблоковано');
    return user;
  }

  listUsers(actor: User, page = 1): ReturnType<User['toPublic']>[] {
    assertCan(actor.role, Permission.MANAGE_USERS);
    return this.users.list(50, (Math.max(1, page) - 1) * 50).map((u) => u.toPublic());
  }

  changeRole(actor: User, userId: string, role: string): ReturnType<User['toPublic']> {
    assertCan(actor.role, Permission.MANAGE_USERS);
    if (!isRole(role)) throw new NotFoundError('Невідома роль');
    if (actor.id === userId) throw new ForbiddenError('Не можна змінювати власну роль');
    const user = this.mustFind(userId);
    user.changeRole(role as Role);
    this.users.save(user);
    this.events.publish({ type: 'UserRoleChanged', userId: user.id, role });
    return user.toPublic();
  }

  setBlocked(actor: User, userId: string, blocked: boolean): ReturnType<User['toPublic']> {
    assertCan(actor.role, Permission.MANAGE_USERS);
    const user = this.mustFind(userId);
    if (blocked) user.block(); else user.unblock();
    this.users.save(user);
    return user.toPublic();
  }

  /** Створює першого адміністратора, якщо його ще немає (використовується під час запуску). */
  ensureAdmin(login: string, email: string, password: string): void {
    if (this.users.findByLogin(login)) return;
    const user = User.register({ login, email, passwordHash: this.hasher.hash(password), now: this.clock.now() });
    user.changeRole(Role.ADMIN);
    this.users.save(user);
  }

  private mustFind(id: string): User {
    const user = this.users.findById(id);
    if (!user) throw new NotFoundError('Користувача не знайдено');
    return user;
  }

  private issue(user: User): AuthResult {
    return { token: this.tokens.sign(user.id, user.role, user.credentialsVersion), user: user.toPublic() };
  }
}
