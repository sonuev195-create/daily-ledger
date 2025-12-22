import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { useSidebarState } from '@/hooks/useSidebar';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { isCollapsed, toggle } = useSidebarState();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex w-full">
      <Sidebar 
        isCollapsed={isCollapsed} 
        onToggle={toggle} 
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      
      {/* Main content with left margin on desktop to account for sidebar */}
      <div className={cn(
        "flex-1 flex flex-col min-h-screen w-full transition-all duration-200",
        isCollapsed ? "lg:ml-[72px]" : "lg:ml-[280px]"
      )}>
        <MobileHeader onMenuClick={() => setIsMobileOpen(true)} title={title} />
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
