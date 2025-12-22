import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, FileText, Users, Truck, Package, ArrowLeftRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';

const reportTypes = [
  { id: 'daily', label: 'Daily Report', icon: FileText, description: 'View daily transaction summary' },
  { id: 'monthly', label: 'Monthly Report', icon: BarChart3, description: 'Month-wise income and expenses' },
  { id: 'customer', label: 'Customer Ledger', icon: Users, description: 'Customer advances and dues' },
  { id: 'supplier', label: 'Supplier Ledger', icon: Truck, description: 'Supplier balances and payments' },
  { id: 'inventory', label: 'Inventory Report', icon: Package, description: 'Stock levels and values' },
  { id: 'drawer', label: 'Drawer Reconciliation', icon: ArrowLeftRight, description: 'Cash drawer balancing' },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  return (
    <AppLayout title="Reports">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Generate and view business reports</p>
        </div>

        {/* Report Types Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {reportTypes.map((report, index) => {
            const Icon = report.icon;
            return (
              <motion.button
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => setSelectedReport(report.id)}
                className={cn(
                  "transaction-card p-6 text-left hover:shadow-md transition-all",
                  selectedReport === report.id && "ring-2 ring-accent"
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{report.label}</h3>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </motion.button>
            );
          })}
        </div>

        {/* Coming Soon Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-center py-12 rounded-2xl border border-dashed border-border"
        >
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Reports Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Detailed reports with charts, exports, and custom date ranges are being developed.
            Stay tuned for powerful business insights!
          </p>
        </motion.div>
      </div>
    </AppLayout>
  );
}
