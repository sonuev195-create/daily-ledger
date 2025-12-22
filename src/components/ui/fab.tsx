import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FabProps {
  onClick: () => void;
  className?: string;
}

export function Fab({ onClick, className }: FabProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-lg shadow-accent/30 flex items-center justify-center z-50",
        "gradient-accent text-accent-foreground",
        "lg:bottom-8 lg:right-8",
        className
      )}
    >
      <Plus className="w-6 h-6" />
    </motion.button>
  );
}
