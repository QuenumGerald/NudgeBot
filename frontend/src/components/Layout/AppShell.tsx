import { Brain, LogOut, MessageSquare, Moon, Settings, Sun } from "lucide-react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/context/theme-provider";

export const AppShell = () => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/85 px-4 py-3 backdrop-blur dark:bg-slate-950/90">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Brain className="size-5" /> NudgeBot
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost"><MessageSquare className="mr-2 size-4" />Chat</Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost"><Settings className="mr-2 size-4" />Settings</Button>
          </Link>
          <Button variant="ghost" onClick={toggleTheme}>{theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}</Button>
          <DropdownMenu trigger={<Button variant="outline">Account</Button>}>
            <DropdownMenuItem onClick={logout}><LogOut className="mr-2 inline size-4" />Logout</DropdownMenuItem>
          </DropdownMenu>
        </nav>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
};
