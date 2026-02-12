import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Settings, Camera, Upload, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useItems } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractedItem {
  extractedName: string;
  matchedName: string | null;
  quantity: number;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
}

export default function SettingsPage() {
  const { items: allItems } = useItems();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleTest = async (file: File) => {
    setIsExtracting(true);
    setExtractedItems([]);

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      setPreviewImage(base64);
      const itemNames = allItems.map(i => i.name);

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames },
      });

      if (error) throw error;

      const items = data?.items || [];
      setExtractedItems(items);

      if (items.length === 0) {
        toast.error('No items found in image');
      } else {
        const matched = items.filter((i: ExtractedItem) => i.matchedName).length;
        toast.success(`Extracted ${items.length} items, ${matched} matched to master`);
      }
    } catch (err: any) {
      console.error('Test extraction error:', err);
      toast.error('Failed to extract: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleTest(file);
    e.target.value = '';
  };

  const confidenceIcon = (c: string) => {
    if (c === 'high') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (c === 'medium') return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

  return (
    <AppLayout title="Settings">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8">
        <div className="hidden lg:block mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Application settings and tools</p>
        </div>

        {/* OCR Matching Test Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary/30 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">OCR Bill Matching Test</h2>
              <p className="text-xs text-muted-foreground">
                Upload or capture a bill image to test item extraction & matching against your item master ({allItems.length} items registered)
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isExtracting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              Capture
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
          </div>

          {isExtracting && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Extracting items from bill...
            </div>
          )}

          {/* Preview Image */}
          {previewImage && !isExtracting && (
            <div className="relative">
              <img src={previewImage} alt="Bill preview" className="w-full rounded-xl max-h-60 object-contain bg-background" />
            </div>
          )}

          {/* Results */}
          {extractedItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Extraction Results ({extractedItems.length} items)
              </h3>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-500/10 rounded-lg p-2">
                  <p className="text-lg font-bold text-green-600">{extractedItems.filter(i => i.confidence === 'high').length}</p>
                  <p className="text-[10px] text-muted-foreground">High</p>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-2">
                  <p className="text-lg font-bold text-yellow-600">{extractedItems.filter(i => i.confidence === 'medium').length}</p>
                  <p className="text-[10px] text-muted-foreground">Medium</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-600">{extractedItems.filter(i => i.confidence === 'low').length}</p>
                  <p className="text-[10px] text-muted-foreground">Low</p>
                </div>
              </div>

              {/* Item Details */}
              <div className="bg-background rounded-xl overflow-hidden border border-border">
                <div className="grid grid-cols-12 gap-1 p-2 bg-secondary/50 text-[10px] font-medium text-muted-foreground">
                  <div className="col-span-1"></div>
                  <div className="col-span-3">Paper Name</div>
                  <div className="col-span-3">Matched To</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>
                {extractedItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 p-2 border-t border-border/50 text-xs items-center">
                    <div className="col-span-1">{confidenceIcon(item.confidence)}</div>
                    <div className="col-span-3 truncate text-foreground">{item.extractedName}</div>
                    <div className="col-span-3 truncate">
                      {item.matchedName ? (
                        <span className="text-green-600 font-medium">{item.matchedName}</span>
                      ) : (
                        <span className="text-destructive">No match</span>
                      )}
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-3 text-right font-medium text-foreground">{formatCurrency(item.amount)}</div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between items-center p-3 bg-accent/10 rounded-xl">
                <span className="text-sm font-medium text-muted-foreground">Extracted Total</span>
                <span className="text-lg font-bold text-accent">
                  {formatCurrency(extractedItems.reduce((sum, i) => sum + i.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
