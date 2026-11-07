// Тости замість рядків тексту: короткі повідомлення про успіх або помилку поверх сторінки.
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from './Icon';

type Kind = 'success' | 'error';
interface ToastItem { id: number; kind: Kind; text: string }
interface ToastApi { success: (text: string) => void; error: (text: string) => void }

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq.current;
    setItems((all) => [...all.slice(-2), { id, kind, text }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  }, [dismiss]);

  const api = useRef<ToastApi>({ success: (t) => push('success', t), error: (t) => push('error', t) });
  api.current = { success: (t) => push('success', t), error: (t) => push('error', t) };

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'success' ? 'check' : 'alert'} size={18} stroke={2.4} />
            <span>{t.text}</span>
            <button type="button" className="toast-close" aria-label="Закрити повідомлення" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/** Текст помилки для тосту з будь-якого винятку. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Сталася помилка');
