import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  CalendarDays, 
  Receipt, 
  UserPlus, 
  Wallet, 
  ShoppingCart, 
  Package, 
  Truck, 
  Users, 
  Percent, 
  ArrowLeftRight, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const menuItems = [
  { id: 'today', label: 'Today', icon: Calendar, path: '/' },
  { id: 'all-date', label: 'All Date', icon: CalendarDays, path: '/all-dates' },
  { id: 'bill', label: 'Bill', icon: Receipt, path: '/bills' },
  { id: 'customer-advance', label: 'Customer Advance', icon: UserPlus, path: '/customer-advance' },
  { id: 'balance-paid', label: 'Balance Paid', icon: Wallet, path: '/balance-paid' },
  { id: 'purchase', label: 'Purchase', icon: ShoppingCart, path: '/purchase' },
  { id: 'items', label: 'Items & Inventory', icon: Package, path: '/items' },
  { id: 'supplier', label: 'Supplier', icon: Truck, path: '/suppliers' },
  { id: 'employee', label: 'Employee', icon: Users, path: '/employees' },
  { id: 'commission', label: 'Commission', icon: Percent, path: '/commission' },
  { id: 'exchange', label: 'Exchange', icon: ArrowLeftRight, path: '/exchange' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/reports' },
];

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 72 : 280,
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={cn(
          "fixed left-0 top-0 h-full bg-sidebar z-50 flex flex-col border-r border-sidebar-border",
          "lg:relative lg:z-auto",
          isCollapsed ? "translate-x-0" : "translate-x-0",
          "max-lg:shadow-xl"
        )}
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
                    onClick={() => {
                      navigate(item.path);
                      if (window.innerWidth < 1024) onToggle();
                    }}
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
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-sidebar-foreground/50"
              >
                <p>Offline Ready</p>
                <p className="text-sidebar-primary">● Synced</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}
