import { Button } from '@/components/ui/button';
import { LogOut, Settings as SettingsIcon, Plus, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  handleNewConversation: () => void;
  handleLogout: () => void;
}

export function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen, handleNewConversation, handleLogout }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const renderContent = () => (
    <>
      <div className="flex items-center justify-between p-4 border-b border-border md:pb-4 md:mb-4">
        <div className="flex items-center space-x-2">
          <img src="/logo.png" alt="NudgeBot" className="w-8 h-8" />
          <span className="font-bold text-lg text-foreground tracking-tight">NudgeBot</span>
        </div>
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <Button
          onClick={() => {
            handleNewConversation();
            setIsMobileMenuOpen(false);
          }}
          className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-0 shadow-none font-medium mb-6"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>

        <div className="text-xs font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Recent</div>
        <div className="space-y-1">
           <div className="px-2 py-2 text-sm text-muted-foreground italic rounded-md">
             No recent chats
           </div>
        </div>
      </div>

      <div className="p-3 border-t border-border space-y-1 bg-card/50">
        <Button variant="ghost" className="w-full justify-start gap-2 text-sm font-medium h-10" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 text-sm font-medium h-10" onClick={() => {
          navigate('/settings');
          setIsMobileMenuOpen(false);
        }}>
          <SettingsIcon className="w-4 h-4" />
          Settings
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 text-sm font-medium h-10 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative flex w-[280px] max-w-xs flex-1 flex-col bg-card border-r border-border shadow-2xl animate-in slide-in-from-left duration-200">
            {renderContent()}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="w-[280px] bg-[#f9f9f9] dark:bg-card border-r border-border flex-col hidden md:flex h-full shadow-sm z-10">
        {renderContent()}
      </div>
    </>
  );
}
