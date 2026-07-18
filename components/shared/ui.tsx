import type {
  ButtonHTMLAttributes,
  DialogHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes
} from "react";
import { AlertTriangle, FileQuestion, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusTones: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-[#eef0ff] text-[#3d35ff]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-700"
};

export function StatusBadge({ tone = "neutral", className, children }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-bold", statusTones[tone], className)}>
      {children}
    </span>
  );
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("soft-card rounded-xl p-5", className)} {...props}>
      {children}
    </section>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("focus-ring h-10 w-full rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm text-[#1c2748]", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("focus-ring h-10 w-full rounded-lg border border-[#dfe5f0] bg-white px-3 text-sm text-[#1c2748]", className)} {...props}>
      {children}
    </select>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-[#edf1fa]", className)} {...props} />;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8def2] bg-[#fbfcff] p-6 text-center">
      <FileQuestion className="mx-auto size-9 text-[#9aa7c7]" />
      <h2 className="mt-3 text-lg font-bold text-[#1c2748]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#617094]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6">{description}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  className
}: {
  value: T;
  items: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex rounded-lg border border-[#dfe5f0] bg-white p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
          className={cn(
            "focus-ring h-9 rounded-md px-3 text-sm font-bold text-[#536088] transition disabled:cursor-not-allowed disabled:opacity-50",
            item.value === value && "bg-[#f0f1ff] text-[#332cff]"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex" title={label}>
      {children}
    </span>
  );
}

export function Dialog({
  open,
  title,
  children,
  className,
  ...props
}: DialogHTMLAttributes<HTMLDivElement> & { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/20 p-4">
      <div className={cn("w-full max-w-lg rounded-xl border border-[#dfe5f0] bg-white p-5 shadow-2xl shadow-slate-900/20", className)} {...props}>
        <h2 className="text-lg font-bold text-[#071334]">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  side = "right",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { open: boolean; title: string; side?: "right" | "left"; children: ReactNode }) {
  if (!open) return null;
  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        "fixed bottom-0 top-0 z-50 w-full max-w-md overflow-y-auto border-[#dfe5f0] bg-white p-5 shadow-2xl shadow-slate-900/20",
        side === "right" ? "right-0 border-l" : "left-0 border-r",
        className
      )}
      {...props}
    >
      <h2 className="text-lg font-bold text-[#071334]">{title}</h2>
      <div className="mt-4">{children}</div>
    </aside>
  );
}

export function Table({ className, children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#edf1fa]">
      <table className={cn("w-full min-w-[720px] text-left text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#edf1fa] bg-[#fbfcff] p-4 text-sm font-bold text-[#536088]">
      <Loader2 className="size-4 animate-spin text-[#3d35ff]" />
      {label}
    </div>
  );
}

export function IconButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={cn("focus-ring grid size-9 place-items-center rounded-md text-[#536088] transition hover:bg-[#f3f5ff] disabled:cursor-not-allowed disabled:opacity-45", className)} {...props}>
      {children}
    </button>
  );
}
