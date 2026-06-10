interface GlobalLogoProps {
  variant?: "dark" | "light";
  size?: number;
  className?: string;
}

export default function GlobalLogo({ variant = "dark", size = 40, className = "" }: GlobalLogoProps) {
  const ringColor = variant === "light" ? "#FFFFFF" : "#14467E";
  const barColor = variant === "light" ? "#6FB2EF" : "#2E86E0";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
    >
      <path
        d="M82.34 39.5 A34 34 0 1 0 82.34 60.5"
        fill="none"
        stroke={ringColor}
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M53 50 L85 50"
        fill="none"
        stroke={barColor}
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}
