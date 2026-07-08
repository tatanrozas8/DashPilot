import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 font-bold text-[#071334]", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-[#3d35ff] text-white shadow-lg shadow-indigo-500/25">
        <Send className="size-5 -rotate-12" fill="currentColor" />
      </span>
      {!compact && <span className="text-2xl tracking-[-0.03em]">DashPilot</span>}
    </div>
  );
}
