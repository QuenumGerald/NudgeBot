import * as React from "react";

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}

export const Select: React.FC<SelectProps> = ({ value, onValueChange, options }) => {
  return (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};
