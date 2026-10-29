import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track">
        <span className="thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Section({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {description && <p className="muted small">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Loads JSON from `url`, exposing data, error and a reload function. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api.get<T>(url));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

type ToastKind = 'ok' | 'error';
const toastListeners = new Set<(t: { id: number; kind: ToastKind; text: string }) => void>();
let toastId = 0;

export function toast(text: string, kind: ToastKind = 'ok') {
  const t = { id: ++toastId, kind, text };
  toastListeners.forEach((l) => l(t));
}

export function toastError(err: unknown) {
  toast(err instanceof Error ? err.message : String(err), 'error');
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; kind: ToastKind; text: string }[]>([]);
  useEffect(() => {
    const listener = (t: { id: number; kind: ToastKind; text: string }) => {
      setItems((list) => [...list, t]);
      window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 3000);
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Text input that only commits on blur or Enter, so typing doesn't spam the API. */
export function CommitInput({
  value,
  onCommit,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    setDraft(value);
    committed.current = value;
  }, [value]);
  const commit = () => {
    if (draft !== committed.current) {
      committed.current = draft;
      onCommit(draft);
    }
  };
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(committed.current);
      }}
    />
  );
}

export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <CommitInput
      type="number"
      className={className}
      min={min}
      max={max}
      step={step}
      value={String(value)}
      onCommit={(v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
        onCommit(clamped);
      }}
    />
  );
}

/** Slider with a live label that only saves when the user lets go. */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label className="field">
      <span>
        {label}: {format(draft)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

export function confirmAction(message: string): boolean {
  return window.confirm(message);
}
