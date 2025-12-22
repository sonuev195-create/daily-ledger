import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <AppLayout title={title}>
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-secondary/50 flex items-center justify-center">
            <Construction className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            This section is under development. Check back soon for updates!
          </p>
        </motion.div>
      </div>
    </AppLayout>
  );
}
