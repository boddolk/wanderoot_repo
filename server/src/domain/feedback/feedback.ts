import { ConflictError, ensure, ValidationError } from '../shared/errors';
import { newId } from '../shared/ids';

/** Оцінка маршруту від 1 до 5. Один користувач – одна оцінка (повторна замінює попередню). */
export class Rating {
  constructor(readonly routeId: string, readonly userId: string, readonly value: number, readonly createdAt: Date) {
    ensure(Number.isInteger(value) && value >= 1 && value <= 5, 'Оцінка має бути цілим числом від 1 до 5');
  }
}

export type CommentStatus = 'VISIBLE' | 'HIDDEN';

export interface CommentProps {
  id: string;
  routeId: string;
  authorId: string;
  text: string;
  status: CommentStatus;
  createdAt: Date;
}

export class Comment {
  private constructor(private props: CommentProps) {}

  static create(routeId: string, authorId: string, text: string, now: Date): Comment {
    return new Comment({ id: newId(), routeId, authorId, text: text.trim(), status: 'VISIBLE', createdAt: now });
  }

  static restore(props: CommentProps): Comment {
    return new Comment({ ...props });
  }

  get id() { return this.props.id; }
  get routeId() { return this.props.routeId; }
  get authorId() { return this.props.authorId; }
  get text() { return this.props.text; }
  get status() { return this.props.status; }
  get createdAt() { return this.props.createdAt; }

  hide(): void {
    if (this.props.status === 'HIDDEN') throw new ConflictError('Коментар уже приховано');
    this.props.status = 'HIDDEN';
  }

  restoreVisibility(): void {
    this.props.status = 'VISIBLE';
  }

  toJSON() { return { ...this.props }; }
}

/** Правило перевірки тексту: повертає повідомлення про порушення або null. */
export type TextRule = (text: string) => string | null;

const DEFAULT_BANNED = ['дурень', 'ідіот', 'придурок', 'idiot', 'stupid', 'fuck', 'shit'];

/**
 * Автоматична перевірка тексту коментарів. Правила задаються списком,
 * тому їх можна змінювати без зміни сервісу відгуків.
 */
export class TextValidator {
  constructor(private readonly rules: TextRule[]) {}

  check(text: string): void {
    for (const rule of this.rules) {
      const problem = rule(text ?? '');
      if (problem) throw new ValidationError(problem);
    }
  }

  static default(banned: string[] = DEFAULT_BANNED, maxLength = 1000, maxLinks = 2): TextValidator {
    const words = banned.map((w) => w.toLowerCase());
    return new TextValidator([
      (t) => (t.trim().length === 0 ? 'Коментар не може бути порожнім' : null),
      (t) => (t.length > maxLength ? `Коментар не може перевищувати ${maxLength} символів` : null),
      (t) => {
        const tokens = t.toLowerCase().split(/[^\p{L}\p{N}]+/u);
        return tokens.some((w) => words.includes(w)) ? 'Коментар містить недопустимі слова' : null;
      },
      (t) => ((t.match(/https?:\/\//gi) ?? []).length > maxLinks ? 'Коментар містить забагато посилань' : null),
    ]);
  }
}
