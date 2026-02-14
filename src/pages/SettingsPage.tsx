import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Settings, Camera, Upload, Loader2, Check, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useItems } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExtractedItem {
  extractedName: string;
  matchedName: string | null;
  quantity: number;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  selectedItemId: string | null;
  confirmed: boolean;
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
      const paperBillNames = allItems.reduce((acc: Record<string, string>, i) => {
        if (i.paperBillName) acc[i.name] = i.paperBillName;
        return acc;
      }, {});

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames },
      });

      if (error) throw error;

      const items = data?.items || [];
      if (items.length === 0) {
        toast.error('No items found in image');
      } else {
        const enriched: ExtractedItem[] = items.map((ext: any) => {
          const matchName = ext.matchedName || ext.extractedName;
          const masterItem = allItems.find(i => i.name.toLowerCase() === matchName?.toLowerCase());
          const isHighConfidence = ext.confidence === 'high' && !!masterItem;
          return {
            extractedName: ext.extractedName,
            matchedName: ext.matchedName,
            quantity: ext.quantity || 0,
            amount: ext.amount || 0,
            confidence: ext.confidence || 'low',
            selectedItemId: masterItem?.id || null,
            confirmed: isHighConfidence,
          };
        });
        setExtractedItems(enriched);
        const matched = enriched.filter(i => i.selectedItemId).length;
        toast.success(`Extracted ${enriched.length} items, ${matched} matched to master`);
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

  const updateItemMatch = (index: number, itemId: string) => {
    const updated = [...extractedItems];
    const masterItem = allItems.find(i => i.id === itemId);
    updated[index] = {
      ...updated[index],
      selectedItemId: itemId || null,
      matchedName: masterItem?.name || null,
      confidence: itemId ? 'high' : 'low',
      confirmed: !!itemId,
    };
    setExtractedItems(updated);
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
                  <p className="text-lg font-bold text-green-600">{extractedItems.filter(i => i.confirmed).length}</p>
                  <p className="text-[10px] text-muted-foreground">Confirmed</p>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-2">
                  <p className="text-lg font-bold text-yellow-600">{extractedItems.filter(i => !i.confirmed && i.selectedItemId).length}</p>
                  <p className="text-[10px] text-muted-foreground">Unconfirmed</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-600">{extractedItems.filter(i => !i.selectedItemId).length}</p>
                  <p className="text-[10px] text-muted-foreground">No Match</p>
                </div>
              </div>

              {/* Item Details */}
              <div className="bg-background rounded-xl overflow-hidden border border-border">
                <div className="grid grid-cols-12 gap-1 p-2 bg-secondary/50 text-[10px] font-medium text-muted-foreground">
                  <div className="col-span-1">✓</div>
                  <div className="col-span-3">Paper Name</div>
                  <div className="col-span-3">Match To</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>
                {extractedItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 p-2 border-t border-border/50 text-xs items-center">
                    {/* Confirmed tick */}
                    <div className="col-span-1">
                      <button
                        onClick={() => {
                          const updated = [...extractedItems];
                          updated[idx] = { ...updated[idx], confirmed: !updated[idx].confirmed };
                          setExtractedItems(updated);
                        }}
                        className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                          item.confirmed
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-border hover:border-muted-foreground"
                        )}
                      >
                        {item.confirmed && <Check className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Extracted name - editable */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={item.extractedName}
                        onChange={(e) => {
                          const updated = [...extractedItems];
                          updated[idx] = { ...updated[idx], extractedName: e.target.value };
                          setExtractedItems(updated);
                        }}
                        className="w-full h-6 px-1 text-[11px] bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent truncate"
                        title={item.extractedName}
                      />
                    </div>

                    {/* Item master select dropdown */}
                    <div className="col-span-3">
                      <select
                        value={item.selectedItemId || ''}
                        onChange={(e) => updateItemMatch(idx, e.target.value)}
                        className={cn(
                          "w-full h-6 px-1 text-[11px] bg-background/50 border rounded focus:ring-1 focus:ring-accent truncate",
                          !item.selectedItemId ? "border-destructive/50 text-destructive" : "border-border text-foreground"
                        )}
                      >
                        <option value="">No match</option>
                        {allItems.map(i => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Qty - editable */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => {
                          const updated = [...extractedItems];
                          updated[idx] = { ...updated[idx], quantity: parseFloat(e.target.value) || 0 };
                          setExtractedItems(updated);
                        }}
                        className="w-full h-6 px-1 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    {/* Amount - editable */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.amount || ''}
                        onChange={(e) => {
                          const updated = [...extractedItems];
                          updated[idx] = { ...updated[idx], amount: parseFloat(e.target.value) || 0 };
                          setExtractedItems(updated);
                        }}
                        className="w-full h-6 px-1 text-xs text-right bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    {/* Remove */}
                    <div className="col-span-1 flex justify-center">
                      <button
                        onClick={() => setExtractedItems(extractedItems.filter((_, i) => i !== idx))}
                        className="text-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between items-center p-3 bg-accent/10 rounded-xl">
                <span className="text-sm font-medium text-muted-foreground">
                  {extractedItems.filter(i => i.confirmed).length}/{extractedItems.length} confirmed
                </span>
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
