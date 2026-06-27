interface EyebrowProps {
  children: React.ReactNode;
  variant?: "light" | "dark";
}

export default function Eyebrow({ children, variant = "light" }: EyebrowProps) {
  const textColor = variant === "dark" ? "text-gl-sky/60" : "text-gl-azure";
  const lineColor = variant === "dark" ? "bg-gl-copper/60" : "bg-gl-azure";

  return (
    <p
      className={`flex items-center justify-center gap-2.5 text-xs font-medium ${textColor} tracking-[0.2em] uppercase mb-4`}
      style={{ fontFamily: "var(--font-data)" }}
    >
      <span className={`inline-block w-[26px] h-[2px] ${lineColor} rounded-full`} />
      {children}
    </p>
  );
}
