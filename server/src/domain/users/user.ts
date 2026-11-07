import { ensure, ValidationError } from '../shared/errors';
import { newId } from '../shared/ids';
import { Role } from './role';

export type AccountStatus = 'ACTIVE' | 'BLOCKED';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

const LOGIN_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_DISPLAY_NAME = 60;
export const MAX_BIO = 500;
export const MAX_CITY = 60;

/** Дані профілю, які користувач може змінювати самостійно. */
export interface ProfileChanges {
  displayName?: string;
  email?: string;
  bio?: string;
  city?: string;
}

export interface UserProps {
  id: string;
  login: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
  /** Коротко про себе (до MAX_BIO символів). */
  bio: string;
  /** Місто або регіон, де користувач зазвичай подорожує. */
  city: string;
  /** Момент останньої зміни пароля: токени, видані раніше, стають недійсними. */
  passwordChangedAt: Date | null;
}

/** Користувач системи. Роль – атрибут, а не підклас, тому її можна змінити без зміни об'єкта. */
export class User {
  private constructor(private props: UserProps) {}

  static validateLogin(login: string): string {
    const v = (login ?? '').trim();
    ensure(LOGIN_RE.test(v), 'Логін має містити від 3 до 32 латинських літер, цифр або символів _ . -');
    return v;
  }

  static validatePassword(password: string): void {
    ensure(typeof password === 'string' && password.length >= 8, 'Пароль має містити не менше 8 символів');
    ensure(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(password) && /\d/.test(password), 'Пароль має містити літеру і цифру');
  }

  static normalizeEmail(email: unknown): string {
    const v = (typeof email === 'string' ? email : '').trim().toLowerCase();
    ensure(EMAIL_RE.test(v), 'Некоректна адреса електронної пошти');
    return v;
  }

  private static normalizeDisplayName(displayName: unknown, login: string): string {
    ensure(displayName === undefined || displayName === null || typeof displayName === 'string', 'Ім\'я має бути текстом');
    const v = ((displayName as string | null | undefined) ?? '').trim() || login;
    ensure(v.length <= MAX_DISPLAY_NAME, `Ім'я не може бути довшим за ${MAX_DISPLAY_NAME} символів`);
    return v;
  }

  private static normalizeText(value: unknown, max: number, field: string): string {
    ensure(value === undefined || value === null || typeof value === 'string', `Поле «${field}» має бути текстом`);
    const v = ((value as string | null | undefined) ?? '').trim();
    ensure(v.length <= max, `Поле «${field}» не може бути довшим за ${max} символів`);
    return v;
  }

  static register(data: { login: string; email: string; displayName?: string; passwordHash: string; now: Date }): User {
    const login = User.validateLogin(data.login);
    return new User({
      id: newId(), login, email: User.normalizeEmail(data.email), displayName: User.normalizeDisplayName(data.displayName, login),
      passwordHash: data.passwordHash, role: Role.USER, status: 'ACTIVE', failedLogins: 0, lockedUntil: null, createdAt: data.now,
      bio: '', city: '', passwordChangedAt: null,
    });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id() { return this.props.id; }
  get login() { return this.props.login; }
  get email() { return this.props.email; }
  get displayName() { return this.props.displayName; }
  get passwordHash() { return this.props.passwordHash; }
  get role() { return this.props.role; }
  get status() { return this.props.status; }
  get failedLogins() { return this.props.failedLogins; }
  get lockedUntil() { return this.props.lockedUntil; }
  get createdAt() { return this.props.createdAt; }
  get bio() { return this.props.bio; }
  get city() { return this.props.city; }
  get passwordChangedAt() { return this.props.passwordChangedAt; }

  isLocked(now: Date): boolean {
    return this.props.lockedUntil !== null && this.props.lockedUntil.getTime() > now.getTime();
  }

  /** Фіксує невдалу спробу входу; після MAX_FAILED_LOGINS спроб блокує вхід на LOCK_MINUTES хвилин. */
  registerFailedLogin(now: Date): void {
    this.props.failedLogins += 1;
    if (this.props.failedLogins >= MAX_FAILED_LOGINS) {
      this.props.lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
      this.props.failedLogins = 0;
    }
  }

  registerSuccessfulLogin(): void {
    this.props.failedLogins = 0;
    this.props.lockedUntil = null;
  }

  /**
   * Оновлює дані профілю. Передані поля перевіряються й нормалізуються,
   * відсутні – залишаються без змін. Порожнє ім'я замінюється логіном.
   */
  updateProfile(changes: ProfileChanges): void {
    const next = { ...this.props };
    if (changes.displayName !== undefined) next.displayName = User.normalizeDisplayName(changes.displayName, this.props.login);
    if (changes.email !== undefined) next.email = User.normalizeEmail(changes.email);
    if (changes.bio !== undefined) next.bio = User.normalizeText(changes.bio, MAX_BIO, 'Про себе');
    if (changes.city !== undefined) next.city = User.normalizeText(changes.city, MAX_CITY, 'Місто');
    this.props = next;
  }

  /** Встановлює новий хеш пароля; токени, видані до цього моменту, більше не приймаються. */
  changePassword(passwordHash: string, now: Date): void {
    this.props.passwordHash = passwordHash;
    this.props.passwordChangedAt = now;
    this.props.failedLogins = 0;
    this.props.lockedUntil = null;
  }

  /** Версія облікових даних: змінюється з кожною зміною пароля і записується в токен. */
  get credentialsVersion(): number {
    return this.props.passwordChangedAt?.getTime() ?? 0;
  }

  /** Чи виданий токен для попередньої версії облікових даних (тобто до зміни пароля). */
  isTokenRevoked(tokenVersion: number | undefined): boolean {
    return (tokenVersion ?? 0) !== this.credentialsVersion;
  }

  changeRole(role: Role): void {
    this.props.role = role;
  }

  block(): void {
    if (this.props.role === Role.ADMIN) throw new ValidationError('Неможливо заблокувати адміністратора');
    this.props.status = 'BLOCKED';
  }

  unblock(): void {
    this.props.status = 'ACTIVE';
  }

  toProps(): UserProps {
    return { ...this.props };
  }

  /** Публічне подання без хешу пароля. */
  toPublic() {
    const { passwordHash: _omit, failedLogins: _f, lockedUntil: _l, passwordChangedAt: _p, ...rest } = this.props;
    return rest;
  }
}
