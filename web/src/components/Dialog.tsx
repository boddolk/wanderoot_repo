// Модальні діалоги замість window.prompt / window.confirm. На телефоні відкриваються знизу як «аркуш».
import { ReactNode, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
}

export function Dialog({ open, title, onClose, children, footer, role = 'dialog' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // ефект залежить лише від open: інакше нова функція onClose при кожному рендері переводила б фокус
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement;
    const focusable = panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog-close)');
    (focusable ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      (previous.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role={role} aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn dialog-close" aria-label="Закрити" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, text, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose} role="alertdialog"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Скасувати</button>
        <button type="button" className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </>}>
      <p className="dialog-text">{text}</p>
    </Dialog>
  );
}
