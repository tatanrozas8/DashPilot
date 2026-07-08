"use client";

import { ToastProvider } from "@/components/shared/toast";
import { AuthProvider } from "@/components/shared/auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
