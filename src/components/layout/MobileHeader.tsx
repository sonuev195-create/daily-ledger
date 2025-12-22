import { Menu, Bell } from 'lucide-react';
import { format } from 'date-fns';

interface MobileHeaderProps {
  onMenuClick: () => void;
  title?: string;
}

export function MobileHeader({ onMenuClick, title }: MobileHeaderProps) {
  const today = new Date();

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border lg:hidden">
      <div className="flex items-center justify-between h-14 px-4">
        <button
          onClick={onMenuClick}
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors -ml-2"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>

        <div className="text-center">
          <h1 className="font-semibold text-foreground">{title || 'Today'}</h1>
          <p className="text-xs text-muted-foreground">{format(today, 'EEEE, MMM d')}</p>
        </div>

        <button className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors -mr-2 relative">
          <Bell className="w-5 h-5 text-foreground" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full" />
        </button>
      </div>
    </header>
  );
}
