import { BarChart3, LineChart, Percent, ShoppingCart, TrendingUp, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  trend: LineChart,
  percent: Percent,
  cart: ShoppingCart,
  growth: TrendingUp,
  chart: BarChart3,
  magic: WandSparkles
};

const tones = {
  blue: "bg-indigo-100 text-[#3d35ff]",
  violet: "bg-violet-100 text-violet-600",
  green: "bg-emerald-100 text-emerald-600",
  sky: "bg-sky-100 text-blue-500",
  orange: "bg-orange-100 text-orange-500"
};

export function MetricIcon({ name = "chart", tone = "blue" }: { name?: string; tone?: keyof typeof tones }) {
  const Icon = icons[name as keyof typeof icons] ?? BarChart3;
  return (
    <span className={cn("grid size-12 place-items-center rounded-full", tones[tone])}>
      <Icon className="size-6" />
    </span>
  );
}
