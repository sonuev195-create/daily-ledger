import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { useSidebarState } from '@/hooks/useSidebar';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { isCollapsed, toggle, expand } = useSidebarState();

  return (
    <div className="min-h-screen bg-background flex w-full">
      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
      
      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-200",
        "lg:ml-0"
      )}>
        <MobileHeader onMenuClick={expand} title={title} />
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
