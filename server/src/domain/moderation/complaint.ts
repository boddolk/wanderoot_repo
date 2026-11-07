import { ConflictError, ensure } from '../shared/errors';
import { newId } from '../shared/ids';

export type TargetType = 'ROUTE' | 'COMMENT' | 'USER';
export type ComplaintReason = 'SPAM' | 'OFFENSIVE' | 'WRONG_DATA' | 'OTHER';
export type ComplaintStatus = 'OPEN' | 'RESOLVED' | 'REJECTED';
/** Рішення модератора: приховати контент, заблокувати автора (лише адміністратор) або відхилити скаргу. */
export type Decision = 'HIDE_CONTENT' | 'BLOCK_USER' | 'REJECT';

const TARGETS: TargetType[] = ['ROUTE', 'COMMENT', 'USER'];
const REASONS: ComplaintReason[] = ['SPAM', 'OFFENSIVE', 'WRONG_DATA', 'OTHER'];
export const DECISIONS: Decision[] = ['HIDE_CONTENT', 'BLOCK_USER', 'REJECT'];

export interface ComplaintProps {
  id: string;
  reporterId: string;
  targetType: TargetType;
  targetId: string;
  reason: ComplaintReason;
  description: string;
  status: ComplaintStatus;
  decision: Decision | null;
  resolvedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export class Complaint {
  private constructor(private props: ComplaintProps) {}

  static file(data: { reporterId: string; targetType: string; targetId: string; reason: string; description?: string }, now: Date): Complaint {
    ensure(TARGETS.includes(data.targetType as TargetType), 'Невідомий тип об\'єкта скарги');
    ensure(REASONS.includes(data.reason as ComplaintReason), 'Невідома причина скарги');
    ensure(typeof data.targetId === 'string' && data.targetId.length > 0, 'Не вказано об\'єкт скарги');
    const description = (data.description ?? '').trim();
    ensure(description.length <= 1000, 'Опис скарги не може перевищувати 1000 символів');
    return new Complaint({
      id: newId(), reporterId: data.reporterId, targetType: data.targetType as TargetType, targetId: data.targetId,
      reason: data.reason as ComplaintReason, description, status: 'OPEN', decision: null, resolvedBy: null,
      createdAt: now, resolvedAt: null,
    });
  }

  static restore(props: ComplaintProps): Complaint {
    return new Complaint({ ...props });
  }

  get id() { return this.props.id; }
  get reporterId() { return this.props.reporterId; }
  get targetType() { return this.props.targetType; }
  get targetId() { return this.props.targetId; }
  get reason() { return this.props.reason; }
  get status() { return this.props.status; }
  get decision() { return this.props.decision; }

  close(decision: Decision, moderatorId: string, now: Date): void {
    if (this.props.status !== 'OPEN') throw new ConflictError('Скаргу вже розглянуто');
    this.props.status = decision === 'REJECT' ? 'REJECTED' : 'RESOLVED';
    this.props.decision = decision;
    this.props.resolvedBy = moderatorId;
    this.props.resolvedAt = now;
  }

  toJSON() { return { ...this.props }; }
}
