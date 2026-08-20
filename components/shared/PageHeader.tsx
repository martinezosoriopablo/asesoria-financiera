import React from "react";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, eyebrow, subtitle, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-4 flex-wrap mb-6 ${className}`}>
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold tracking-[0.22em] uppercase text-gb-primary">{eyebrow}</div>
        )}
        <h1 className="font-serif text-2xl font-semibold text-gb-black mt-1">{title}</h1>
        {subtitle && <p className="text-sm text-gb-gray mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
