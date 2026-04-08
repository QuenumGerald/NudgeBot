import * as React from "react";

export const Dialog: React.FC<{ open: boolean; onOpenChange: (value: boolean) => void; children: React.ReactNode }> = ({
  open,
  onOpenChange,
  children
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};
