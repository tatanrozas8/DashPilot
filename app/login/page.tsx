import { Suspense } from "react";
import { LoginPage } from "@/components/login-page";

export default function LoginRoutePage() {
  return (
    <Suspense fallback={<main className="grid min-h-[100dvh] place-items-center bg-[#f8faff] text-sm font-semibold text-[#3d35ff]">Cargando login...</main>}>
      <LoginPage />
    </Suspense>
  );
}
