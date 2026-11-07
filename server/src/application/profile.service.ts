import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/shared/errors';
import { ProfileChanges, User } from '../domain/users/user';
import { AuthResult } from './auth.service';
import { Clock, EventBus, PasswordHasher, TokenService, UserActivity, UserRepository } from './ports';

export interface ProfileView {
  user: ReturnType<User['toPublic']>;
  activity: UserActivity;
}

/**
 * Фасад для керування власним профілем: перегляд з активністю, зміна особистих даних і пароля.
 * Чутливі зміни (email, пароль) вимагають підтвердження поточним паролем.
 */
export class ProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  view(actor: { id: string }): ProfileView {
    const user = this.mustFind(actor.id);
    return { user: user.toPublic(), activity: this.users.activity(user.id) };
  }

  update(actor: { id: string }, data: ProfileChanges & { currentPassword?: string }): ReturnType<User['toPublic']> {
    const user = this.mustFind(actor.id);
    const changes: ProfileChanges = {
      displayName: data?.displayName, bio: data?.bio, city: data?.city,
    };
    if (data?.email !== undefined) {
      const email = User.normalizeEmail(data.email);
      if (email !== user.email) {
        this.confirmPassword(user, data.currentPassword);
        if (this.users.existsByEmail(email, user.id)) throw new ConflictError('Ця адреса електронної пошти вже використовується');
        changes.email = email;
      }
    }
    user.updateProfile(changes);
    this.users.save(user);
    return user.toPublic();
  }

  /** Змінює пароль і повертає новий токен: усі раніше видані токени стають недійсними. */
  changePassword(actor: { id: string }, currentPassword: string, newPassword: string): AuthResult {
    const user = this.mustFind(actor.id);
    this.confirmPassword(user, currentPassword);
    User.validatePassword(newPassword);
    if (this.hasher.verify(newPassword, user.passwordHash)) throw new ValidationError('Новий пароль має відрізнятися від поточного');
    user.changePassword(this.hasher.hash(newPassword), this.clock.now());
    this.users.save(user);
    this.events.publish({ type: 'PasswordChanged', userId: user.id });
    return { token: this.tokens.sign(user.id, user.role, user.credentialsVersion), user: user.toPublic() };
  }

  /** Перевірка поточного пароля з тим самим захистом від підбору, що й під час входу. */
  private confirmPassword(user: User, password: string | undefined): void {
    const now = this.clock.now();
    if (user.isLocked(now)) throw new ForbiddenError('Забагато невдалих спроб. Спробуйте пізніше');
    if (typeof password !== 'string' || !password) throw new ValidationError('Введіть поточний пароль для підтвердження');
    if (!this.hasher.verify(password, user.passwordHash)) {
      user.registerFailedLogin(now);
      this.users.save(user);
      throw new ValidationError('Поточний пароль введено невірно');
    }
  }

  private mustFind(id: string): User {
    const user = this.users.findById(id);
    if (!user) throw new NotFoundError('Користувача не знайдено');
    return user;
  }
}
