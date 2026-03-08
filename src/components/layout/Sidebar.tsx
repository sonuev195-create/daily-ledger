import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Receipt, 
  Package, 
  Users, 
  Percent, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
  Wallet,
  Settings,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const allMenuItems = [
  { id: 'today', label: 'Today', icon: Calendar, path: '/', adminOnly: false },
  { id: 'bill', label: 'Bill', icon: Receipt, path: '/bills', adminOnly: false },
  { id: 'customers', label: 'Customers', icon: Users, path: '/customers', adminOnly: false },
  { id: 'suppliers', label: 'Suppliers', icon: Wallet, path: '/suppliers', adminOnly: false },
  { id: 'employees', label: 'Employees', icon: Users, path: '/employees', adminOnly: false },
  { id: 'welders', label: 'Welders', icon: Percent, path: '/welders', adminOnly: false },
  { id: 'items', label: 'Items & Inventory', icon: Package, path: '/items', adminOnly: false },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/reports', adminOnly: false },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', adminOnly: true },
];

export function Sidebar({ isCollapsed, onToggle, isMobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleNavigation = (path: string) => {
    navigate(path);
    onMobileClose();
  };

  const handleLogout = () => {
    logout();
    onMobileClose();
  };

  // Desktop sidebar
  const DesktopSidebar = () => (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="hidden lg:flex fixed left-0 top-0 h-full bg-sidebar z-40 flex-col border-r border-sidebar-border"
    >
      {/* Header */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 flex-1"
            >
              <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
                <Wallet className="w-4 h-4 text-accent-foreground" />
              </div>
              <span className="font-semibold text-sidebar-foreground">CashFlow</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors ml-auto"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-hide">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            const menuButton = (
              <li key={item.id}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={cn(
                    "sidebar-item w-full",
                    isActive && "sidebar-item-active"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.id} delayDuration={0}>
                  <TooltipTrigger asChild>
                    {menuButton}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return menuButton;
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <AnimatePresence mode="wait">
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                  {user?.display_name?.[0] || user?.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-sidebar-foreground">{user?.display_name || user?.username}</p>
                  <p className="text-sidebar-foreground/50 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 transition-colors w-full"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </motion.div>
          ) : (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button onClick={handleLogout} className="w-full flex justify-center text-destructive hover:text-destructive/80">
                  <LogOut className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );

  // Mobile sidebar (overlay)
  const MobileSidebar = () => (
    <AnimatePresence>
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 lg:hidden"
            onClick={onMobileClose}
          />

          {/* Sidebar */}
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="fixed left-0 top-0 h-full w-[280px] bg-sidebar z-50 flex flex-col border-r border-sidebar-border lg:hidden shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-accent-foreground" />
                </div>
                <span className="font-semibold text-sidebar-foreground">CashFlow</span>
              </div>
              <button
                onClick={onMobileClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-hide">
              <ul className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleNavigation(item.path)}
                        className={cn(
                          "sidebar-item w-full",
                          isActive && "sidebar-item-active"
                        )}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-sidebar-border space-y-3">
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                  {user?.display_name?.[0] || user?.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-sidebar-foreground">{user?.display_name || user?.username}</p>
                  <p className="text-sidebar-foreground/50 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 transition-colors w-full"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}
