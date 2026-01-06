import { useState } from 'react';
import { motion } from 'framer-motion';
import { Percent, Construction } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

export default function CommissionPage() {
  return (
    <AppLayout title="Commission">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Percent className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Commission</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Commission tracking for sales and purchases. Coming soon!
          </p>
        </motion.div>
      </div>
    </AppLayout>
  );
}
