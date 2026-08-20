import React from "react";

interface CardProps {
  children: React.ReactNode;
  highlight?: boolean;
  title?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function Card({ children, highlight = false, title, action, className = "" }: CardProps) {
  const surface = highlight
    ? "bg-gb-black text-white border-gb-black"
    : "bg-white text-gb-black border-gb-border";
  return (
    <div className={`rounded-md border p-5 ${surface} ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-serif text-base ${highlight ? "text-white" : "text-gb-black"}`}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
