import { randomUUID } from 'node:crypto';

/** Генерує унікальний ідентифікатор сутності (UUID v4). */
export const newId = (): string => randomUUID();
