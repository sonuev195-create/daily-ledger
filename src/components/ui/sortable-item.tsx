import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  gripClassName?: string;
}

export function SortableItem({ id, children, className, gripClassName }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-80 shadow-lg scale-[1.02]', className)}>
      <div className="flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "touch-none shrink-0 w-8 h-10 flex items-center justify-center rounded-lg cursor-grab active:cursor-grabbing text-muted-foreground hover:bg-secondary/80 transition-colors",
            gripClassName
          )}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
