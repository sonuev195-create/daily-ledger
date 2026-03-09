import { X, Download, Edit2 } from 'lucide-react';
import { Bill, Transaction } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { format } from 'date-fns';
import { generateBillPDF, downloadPDF } from '@/lib/pdfGenerator';

interface BillDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill | null;
  transaction?: Transaction | null;
  onEdit?: () => void;
}

export function BillDetailsSheet({ isOpen, onClose, bill, transaction, onEdit }: BillDetailsSheetProps) {
  if (!bill) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDownloadPDF = () => {
    const doc = generateBillPDF(bill, transaction || undefined);
    downloadPDF(doc, `bill-${bill.billNumber || bill.id.slice(0, 8)}`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">Bill Details</SheetTitle>
              <div className="flex items-center gap-2 pr-10">
                {onEdit && (
                  <button 
                    onClick={onEdit} 
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={handleDownloadPDF} 
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Bill Info */}
            <div className="bg-secondary/30 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Bill Number</p>
                  <p className="font-medium text-foreground">{bill.billNumber || bill.id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{format(new Date(bill.createdAt), 'MMM d, yyyy')}</p>
                </div>
                {bill.customerName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium text-foreground">{bill.customerName}</p>
                  </div>
                )}
                {bill.supplierName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p className="font-medium text-foreground">{bill.supplierName}</p>
                  </div>
                )}
                {bill.billType && (
                  <div>
                    <p className="text-xs text-muted-foreground">Bill Type</p>
                    <p className="font-medium text-foreground">{bill.billType === 'g_bill' ? 'G Bill' : 'N Bill'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bill Image */}
            {bill.imageUrl && (
              <div className="mb-4">
                <img src={bill.imageUrl} alt="Bill" className="w-full rounded-xl" />
              </div>
            )}

            {/* Items Table */}
            <div className="bg-secondary/30 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 p-3 bg-secondary/50 text-xs font-medium text-muted-foreground">
                <div className="col-span-4">Item</div>
                <div className="col-span-2 text-center">Pri. Qty</div>
                <div className="col-span-2 text-center">Sec. Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              {bill.items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 p-3 border-t border-border/50 text-sm">
                  <div className="col-span-4 font-medium text-foreground">{item.itemName}</div>
                  <div className="col-span-2 text-center text-muted-foreground">{item.primaryQuantity}</div>
                  <div className="col-span-2 text-center text-muted-foreground">{item.secondaryQuantity}</div>
                  <div className="col-span-2 text-right text-muted-foreground">{formatCurrency(item.rate)}</div>
                  <div className="col-span-2 text-right font-medium text-foreground">{formatCurrency(item.totalAmount)}</div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 bg-accent/10 rounded-xl p-4 flex justify-between items-center">
              <span className="font-medium text-foreground">Total Amount</span>
              <span className="text-2xl font-bold text-accent">{formatCurrency(bill.totalAmount)}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
