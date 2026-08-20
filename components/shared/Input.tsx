import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, className = "", id, name, ...rest },
  ref
) {
  const inputId = id ?? name;
  return (
    <div>
      {label && <label htmlFor={inputId} className="block text-xs font-medium text-gb-dark mb-1.5">{label}</label>}
      <input
        ref={ref}
        id={inputId}
        name={name}
        className={`w-full border border-gb-border rounded-[3px] px-3 py-2.5 text-sm text-gb-black bg-white placeholder:text-gb-gray/60 focus:border-gb-primary focus:outline-none focus:ring-1 focus:ring-gb-primary/30 transition-colors disabled:opacity-60 ${className}`}
        {...rest}
      />
      {hint && <p className="text-xs text-gb-gray mt-1">{hint}</p>}
    </div>
  );
});

export default Input;
