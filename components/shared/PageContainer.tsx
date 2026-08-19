import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}

export default function PageContainer({ children, wide = false, className = "" }: PageContainerProps) {
  return (
    <div className={`mx-auto w-full px-5 py-8 ${wide ? "max-w-7xl" : "max-w-6xl"} ${className}`}>
      {children}
    </div>
  );
}
