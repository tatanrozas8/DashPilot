import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "soft";

const variants: Record<Variant, string> = {
  primary: "bg-[#3d35ff] text-white shadow-lg shadow-indigo-500/25 hover:bg-[#3028df]",
  secondary: "border border-[#dce3f4] bg-white text-[#071334] hover:border-[#bfc9ea]",
  ghost: "text-[#536088] hover:bg-[#f1f4ff]",
  soft: "border border-[#dfe5fb] bg-[#f4f5ff] text-[#3028df] hover:bg-[#eceeff]"
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
