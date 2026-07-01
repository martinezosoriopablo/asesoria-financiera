import Image from "next/image";

interface GlobalLogoProps {
  variant?: "dark" | "light";
  className?: string;
}

export default function GlobalLogo({ variant = "dark", className = "" }: GlobalLogoProps) {
  return (
    <Image
      src="/images/global2.jpeg"
      alt="Global Wealth"
      width={200}
      height={200}
      className={`object-contain ${variant === "light" ? "invert mix-blend-screen" : ""} ${className}`}
      priority
    />
  );
}
