interface GBrandMarkProps {
  className?: string;
}

export default function GBrandMark({ className = "w-9 h-9" }: GBrandMarkProps) {
  return (
    <svg className={className} viewBox="0 0 100 100">
      <path
        d="M72 28 A33 33 0 1 0 80 56 L56 56"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
      />
      <rect x="40" y="52" width="6" height="22" rx="1" fill="#EB7838" />
      <rect x="50" y="44" width="6" height="30" rx="1" fill="#EB7838" />
      <rect x="60" y="37" width="6" height="37" rx="1" fill="#EB7838" />
    </svg>
  );
}
