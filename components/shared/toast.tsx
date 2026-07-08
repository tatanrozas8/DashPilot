"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

interface ToastItem {
  id: string;
  message: string;
}

const ToastContext = createContext<{ toast: (message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const value = useMemo(
    () => ({
      toast: (message: string) => {
        const id = crypto.randomUUID();
        setItems((current) => [...current, { id, message }]);
        window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3000);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex min-w-[300px] items-center gap-3 rounded-xl border border-[#dfe5f0] bg-white p-4 shadow-2xl shadow-slate-900/10">
            <CheckCircle2 className="size-6 text-emerald-600" />
            <p className="text-sm font-semibold text-[#071334]">{item.message}</p>
            <button onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))} className="ml-auto text-[#697597]">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context.toast;
}
