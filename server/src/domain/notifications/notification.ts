import { newId } from '../shared/ids';

export interface NotificationProps {
  id: string;
  userId: string;
  type: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export class Notification {
  private constructor(private props: NotificationProps) {}

  static create(userId: string, type: string, message: string, link: string | null, now: Date): Notification {
    return new Notification({ id: newId(), userId, type, message, link, read: false, createdAt: now });
  }

  static restore(props: NotificationProps): Notification {
    return new Notification({ ...props });
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get read() { return this.props.read; }

  markRead(): void {
    this.props.read = true;
  }

  toJSON() { return { ...this.props }; }
}
