import Image from "next/image";
import { cn } from "@/lib/utils";

export default function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Creme Castle"
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-xl", className)}
    />
  );
}
