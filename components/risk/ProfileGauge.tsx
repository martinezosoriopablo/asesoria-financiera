interface ProfileGaugeProps {
  label: string;
  value: number;
  color: string;
}

export function ProfileGauge({ label, value, color }: ProfileGaugeProps) {
  const safeValue = isNaN(value) ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="border border-slate-100 rounded-lg p-4 flex flex-col bg-white">
      <span className="text-sm font-medium text-slate-700 mb-2">{label}</span>
      <div className="flex-1 flex flex-col justify-center">
        <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full ${color}`}
            style={{ width: `${safeValue}%` }}
          ></div>
        </div>
        <span className="text-sm font-semibold text-slate-900">
          {safeValue.toFixed(1)}/100
        </span>
      </div>
    </div>
  );
}
