import Image from "next/image";

interface GlobalLogoProps {
  variant?: "dark" | "light";
  className?: string;
  /** @deprecated ignored — kept for backward compat with callers */
  size?: number;
}

export default function GlobalLogo({ variant = "dark", className = "" }: GlobalLogoProps) {
  return (
    <Image
      src="/images/global1.jpeg"
      alt="Global Wealth"
      width={220}
      height={40}
      className={`h-8 w-auto object-contain ${variant === "light" ? "brightness-0 invert" : ""} ${className}`}
      priority
    />
  );
}
