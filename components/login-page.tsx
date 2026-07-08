"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/shared/button";
import { useAuth } from "@/components/shared/auth-provider";
import { signInWithPassword, signUpWithPassword } from "@/lib/supabase/auth";

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Safe next path extraction preventing redirect loops back to login/logout
  const rawNext = searchParams.get("next") || "/app";
  const nextPath = rawNext === "/login" || rawNext === "/logout" ? "/app" : rawNext;

  const { configured, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (configured && session) {
      // Clear local mode bypass cookie since we now have an active session
      document.cookie = "dashpilot_local_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      router.replace(nextPath);
      router.refresh();
    }
  }, [configured, session, nextPath, router]);

  async function submit(mode: "login" | "signup") {
    try {
      setError("");
      setStatus(mode === "login" ? "Iniciando sesion..." : "Creando cuenta...");
      if (mode === "login") {
        await signInWithPassword(email, password);
        document.cookie = "dashpilot_local_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        setStatus("Sesion lista. Redirigiendo...");
        router.replace(nextPath);
        router.refresh();
      } else {
        const data = await signUpWithPassword(email, password);
        document.cookie = "dashpilot_local_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        if (data?.session) {
          setStatus("Cuenta creada e inicio de sesion exitoso. Redirigiendo...");
          router.replace(nextPath);
          router.refresh();
        } else {
          setStatus("Registro exitoso. Por favor revisa tu correo electronico para confirmar tu cuenta.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el acceso.");
      setStatus("");
    }
  }

  function handleLocalMode() {
    // Set cookie to bypass middleware redirect
    document.cookie = "dashpilot_local_mode=true; path=/; max-age=31536000";
    router.push("/app");
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8faff] px-6 text-[#071334]">
      <section className="w-full max-w-md rounded-2xl border border-[#e3e8f5] bg-white p-8 shadow-xl shadow-slate-900/5">
        <Logo />
        <h1 className="mt-7 text-3xl font-black tracking-[-0.04em]">Iniciar sesion</h1>
        <p className="mt-2 text-sm leading-6 text-[#617094]">Conecta Supabase Auth para guardar datasets, dashboards, presentaciones y enlaces reales.</p>
        {!configured && (
          <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Supabase no esta configurado. Puedes seguir usando DashPilot en modo local.
          </p>
        )}
        <div className="mt-6 space-y-3">
          <input
            className="h-12 w-full rounded-lg border border-[#dfe5f0] px-4 text-sm outline-none focus:border-[#3d35ff]"
            placeholder="correo@empresa.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="h-12 w-full rounded-lg border border-[#dfe5f0] px-4 text-sm outline-none focus:border-[#3d35ff]"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {status && <p className="mt-4 text-sm font-semibold text-[#3d35ff]">{status}</p>}
        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button disabled={!configured} onClick={() => void submit("login")}>Iniciar sesion</Button>
          <Button disabled={!configured} variant="secondary" onClick={() => void submit("signup")}>Crear cuenta</Button>
          <button onClick={handleLocalMode} className="inline-flex h-11 items-center rounded-lg border border-[#dce3f4] px-5 text-sm font-semibold">Usar modo local</button>
        </div>
      </section>
    </main>
  );
}
