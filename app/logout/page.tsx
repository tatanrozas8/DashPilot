"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/supabase/auth";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    void signOut().finally(() => router.replace("/"));
  }, [router]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8faff] text-sm font-semibold text-[#3d35ff]">
      Cerrando sesion...
    </main>
  );
}
