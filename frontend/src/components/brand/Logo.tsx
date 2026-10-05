import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ height = 34, className, priority = false }: { height?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="Radian Marketing"
      width={Math.round((height * 421) / 158)}
      height={height}
      priority={priority}
      className={cn("h-auto select-none", className)}
      style={{ height, width: "auto" }}
    />
  );
}
