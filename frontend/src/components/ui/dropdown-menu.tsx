import * as React from "react";

export const DropdownMenu: React.FC<{ trigger: React.ReactNode; children: React.ReactNode }> = ({
  trigger,
  children
}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block text-left">
      <button onClick={() => setOpen((prev) => !prev)}>{trigger}</button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 min-w-40 rounded-md border bg-white p-1 shadow dark:bg-slate-900">{children}</div>
      ) : null}
    </div>
  );
};

export const DropdownMenuItem: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({
  onClick,
  children
}) => (
  <button onClick={onClick} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
    {children}
  </button>
);
