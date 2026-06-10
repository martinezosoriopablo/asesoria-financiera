interface EyebrowProps {
  children: React.ReactNode;
}

export default function Eyebrow({ children }: EyebrowProps) {
  return (
    <p
      className="flex items-center justify-center gap-2.5 text-xs font-medium text-gl-azure tracking-[0.2em] uppercase mb-4"
      style={{ fontFamily: "var(--font-data)" }}
    >
      <span className="inline-block w-[26px] h-[2px] bg-gl-azure rounded-full" />
      {children}
    </p>
  );
}
