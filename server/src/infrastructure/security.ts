import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AuthError } from '../domain/shared/errors';
import { Clock, PasswordHasher, TokenPayload, TokenService } from '../application/ports';

/** Хешування паролів алгоритмом scrypt з унікальною сіллю. Формат: scrypt$N$сіль$хеш. */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 16384) {}

  hash(password: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, 32, { N: this.cost });
    return `scrypt$${this.cost}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  verify(password: string, stored: string): boolean {
    const [alg, n, salt, hash] = stored.split('$');
    if (alg !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
    return timingSafeEqual(expected, actual);
  }
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** JSON Web Token (HS256) без зовнішніх бібліотек. */
export class HmacTokenService implements TokenService {
  constructor(private readonly secret: string, private readonly clock: Clock, private readonly ttlSeconds = 24 * 3600) {
    if (!secret || secret.length < 16) throw new Error('JWT secret має містити щонайменше 16 символів');
  }

  sign(userId: string, role: string, version = 0): string {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const payload = b64url(JSON.stringify({ sub: userId, role, ver: version, iat, exp: iat + this.ttlSeconds }));
    return `${header}.${payload}.${this.signature(`${header}.${payload}`)}`;
  }

  verify(token: string): TokenPayload {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) throw new AuthError('Некоректний токен');
    const expected = Buffer.from(this.signature(`${parts[0]}.${parts[1]}`));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AuthError('Некоректний підпис токена');
    let payload: TokenPayload;
    try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new AuthError('Некоректний токен'); }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= this.clock.now().getTime()) throw new AuthError('Строк дії токена минув');
    return payload;
  }

  private signature(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }
}
