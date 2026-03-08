import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Camera, Upload, Loader2, Check, Trash2, Save, TableProperties, KeyRound, Eye, EyeOff } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useItems } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface ExtractedItem {
  extractedName: string;
  matchedName: string | null;
  quantity: number;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  selectedItemId: string | null;
  confirmed: boolean;
}

interface BillFormatConfig {
  id?: string;
  config_name: string;
  bill_type: string;
  total_columns: number;
  item_name_column: number;
  quantity_column: number;
  quantity_type: string;
  rate_column: number | null;
  amount_column: number;
  has_rate: boolean;
  has_amount: boolean;
}

const COLUMN_FIELDS = [
  { key: 'item_name_column', label: 'Item Name', icon: '📝' },
  { key: 'quantity_column', label: 'Quantity', icon: '🔢' },
  { key: 'rate_column', label: 'Rate/Price', icon: '💰' },
  { key: 'amount_column', label: 'Amount/Total', icon: '💵' },
];

export default function SettingsPage() {
  const { items: allItems } = useItems();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Bill format config state
  const [formatConfig, setFormatConfig] = useState<BillFormatConfig>({
    config_name: 'default',
    bill_type: 'both',
    total_columns: 4,
    item_name_column: 1,
    quantity_column: 2,
    quantity_type: 'primary',
    rate_column: 3,
    amount_column: 4,
    has_rate: true,
    has_amount: true,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Font size
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('app-font-size') || 'medium');
  const applyFontSize = (size: string) => {
    setFontSize(size);
    localStorage.setItem('app-font-size', size);
    const sizeMap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
    document.documentElement.style.fontSize = sizeMap[size] || '16px';
  };

  // Load existing config
  useEffect(() => {
    loadFormatConfig();
  }, []);

  const loadFormatConfig = async () => {
    const { data } = await supabase
      .from('bill_format_config')
      .select('*')
      .eq('config_name', 'default')
      .maybeSingle();

    if (data) {
      setFormatConfig(data as BillFormatConfig);
    }
    setConfigLoaded(true);
  };

  const saveFormatConfig = async () => {
    setSavingConfig(true);
    try {
      if (formatConfig.id) {
        await supabase
          .from('bill_format_config')
          .update({
            bill_type: formatConfig.bill_type,
            total_columns: formatConfig.total_columns,
            item_name_column: formatConfig.item_name_column,
            quantity_column: formatConfig.quantity_column,
            quantity_type: formatConfig.quantity_type,
            rate_column: formatConfig.has_rate ? formatConfig.rate_column : null,
            amount_column: formatConfig.amount_column,
            has_rate: formatConfig.has_rate,
            has_amount: formatConfig.has_amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', formatConfig.id);
      } else {
        const { data } = await supabase
          .from('bill_format_config')
          .insert({
            config_name: 'default',
            bill_type: formatConfig.bill_type,
            total_columns: formatConfig.total_columns,
            item_name_column: formatConfig.item_name_column,
            quantity_column: formatConfig.quantity_column,
            quantity_type: formatConfig.quantity_type,
            rate_column: formatConfig.has_rate ? formatConfig.rate_column : null,
            amount_column: formatConfig.amount_column,
            has_rate: formatConfig.has_rate,
            has_amount: formatConfig.has_amount,
          })
          .select()
          .single();
        if (data) setFormatConfig(prev => ({ ...prev, id: data.id }));
      }
      toast.success('Bill format configuration saved! The app is now trained for your paper bills.');
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

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

      // Pass column mapping config
      const columnMapping = {
        totalColumns: formatConfig.total_columns,
        itemNameColumn: formatConfig.item_name_column,
        quantityColumn: formatConfig.quantity_column,
        quantityType: formatConfig.quantity_type,
        rateColumn: formatConfig.has_rate ? formatConfig.rate_column : null,
        amountColumn: formatConfig.amount_column,
        hasRate: formatConfig.has_rate,
        hasAmount: formatConfig.has_amount,
      };

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames, columnMapping },
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

  const columnNumbers = Array.from({ length: formatConfig.total_columns }, (_, i) => i + 1);

  const [resetConfirm, setResetConfirm] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleResetDatabase = async () => {
    if (resetConfirm !== 'RESET') {
      toast.error('Type RESET to confirm');
      return;
    }
    setIsResetting(true);
    try {
      const tables = [
        'bill_items', 'bills', 'transactions', 'batches',
        'drawer_closings', 'drawer_openings', 'exchanges',
      ];
      for (const table of tables) {
        await supabase.from(table as any).delete().gte('created_at', '1970-01-01');
      }
      // Reset balances
      await supabase.from('customers').update({ due_balance: 0, advance_balance: 0 } as any).gte('created_at', '1970-01-01');
      await supabase.from('suppliers').update({ balance: 0 } as any).gte('created_at', '1970-01-01');
      await supabase.from('employees').update({ advance_balance: 0 } as any).gte('created_at', '1970-01-01');
      toast.success('All data erased successfully');
      setResetConfirm('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset database');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AppLayout title="Settings">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8 space-y-6">
        <div className="hidden lg:block mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Application settings and training</p>
        </div>

        {/* ========== Bill Format Training Section ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary/30 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TableProperties className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Paper Bill Column Training</h2>
              <p className="text-xs text-muted-foreground">
                Define the layout of your paper bills so the app knows which column is item name, quantity, rate, and amount.
              </p>
            </div>
          </div>

          {/* Bill type selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Apply to</label>
            <div className="flex gap-2">
              {(['both', 'sale', 'purchase'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFormatConfig(prev => ({ ...prev, bill_type: type }))}
                  className={cn(
                    "px-3 py-2 rounded-xl text-sm font-medium transition-all",
                    formatConfig.bill_type === type
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {type === 'both' ? 'Sale & Purchase' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Total columns */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              How many columns does your paper bill have?
            </label>
            <div className="flex gap-2">
              {[3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setFormatConfig(prev => ({ ...prev, total_columns: n }))}
                  className={cn(
                    "w-10 h-10 rounded-xl text-sm font-bold transition-all",
                    formatConfig.total_columns === n
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Column Mapping - Visual */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Assign each column number to a field (tick the ones present in your bill)
            </label>

            {/* Visual column preview */}
            <div className="mb-3 bg-background rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground mb-2">Paper Bill Column Preview:</div>
              <div className="flex gap-1">
                {columnNumbers.map(col => {
                  let label = `Col ${col}`;
                  let bgClass = 'bg-secondary/50';
                  if (col === formatConfig.item_name_column) { label = '📝 Item'; bgClass = 'bg-primary/15'; }
                  else if (col === formatConfig.quantity_column) { label = '🔢 Qty'; bgClass = 'bg-info/15'; }
                  else if (formatConfig.has_rate && col === formatConfig.rate_column) { label = '💰 Rate'; bgClass = 'bg-warning/15'; }
                  else if (col === formatConfig.amount_column) { label = '💵 Amt'; bgClass = 'bg-success/15'; }
                  return (
                    <div key={col} className={cn("flex-1 text-center py-2 px-1 rounded-lg text-[11px] font-medium", bgClass)}>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              {/* Item Name Column */}
              <div className="flex items-center justify-between bg-background rounded-lg p-3 border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📝</span>
                  <span className="text-xs font-medium">Item Name</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Column #</span>
                  <select
                    value={formatConfig.item_name_column}
                    onChange={(e) => setFormatConfig(prev => ({ ...prev, item_name_column: parseInt(e.target.value) }))}
                    className="w-14 h-8 text-center text-xs bg-secondary/50 border border-border rounded-lg"
                  >
                    {columnNumbers.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Quantity Column */}
              <div className="flex items-center justify-between bg-background rounded-lg p-3 border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔢</span>
                  <div>
                    <span className="text-xs font-medium">Quantity</span>
                    <div className="flex gap-1 mt-1">
                      {(['primary', 'secondary'] as const).map(qt => (
                        <button
                          key={qt}
                          onClick={() => setFormatConfig(prev => ({ ...prev, quantity_type: qt }))}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] transition-all",
                            formatConfig.quantity_type === qt
                              ? "bg-info text-white"
                              : "bg-secondary/50 text-muted-foreground"
                          )}
                        >
                          {qt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Column #</span>
                  <select
                    value={formatConfig.quantity_column}
                    onChange={(e) => setFormatConfig(prev => ({ ...prev, quantity_column: parseInt(e.target.value) }))}
                    className="w-14 h-8 text-center text-xs bg-secondary/50 border border-border rounded-lg"
                  >
                    {columnNumbers.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Rate Column (optional) */}
              <div className={cn(
                "flex items-center justify-between bg-background rounded-lg p-3 border transition-all",
                formatConfig.has_rate ? "border-border" : "border-border/50 opacity-60"
              )}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormatConfig(prev => ({ ...prev, has_rate: !prev.has_rate }))}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      formatConfig.has_rate
                        ? "bg-warning border-warning text-white"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    {formatConfig.has_rate && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm">💰</span>
                  <span className="text-xs font-medium">Rate/Price per unit</span>
                </div>
                {formatConfig.has_rate && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Column #</span>
                    <select
                      value={formatConfig.rate_column || ''}
                      onChange={(e) => setFormatConfig(prev => ({ ...prev, rate_column: parseInt(e.target.value) }))}
                      className="w-14 h-8 text-center text-xs bg-secondary/50 border border-border rounded-lg"
                    >
                      {columnNumbers.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Amount Column */}
              <div className={cn(
                "flex items-center justify-between bg-background rounded-lg p-3 border transition-all",
                formatConfig.has_amount ? "border-border" : "border-border/50 opacity-60"
              )}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormatConfig(prev => ({ ...prev, has_amount: !prev.has_amount }))}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      formatConfig.has_amount
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    {formatConfig.has_amount && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm">💵</span>
                  <span className="text-xs font-medium">Amount/Total</span>
                </div>
                {formatConfig.has_amount && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Column #</span>
                    <select
                      value={formatConfig.amount_column}
                      onChange={(e) => setFormatConfig(prev => ({ ...prev, amount_column: parseInt(e.target.value) }))}
                      className="w-14 h-8 text-center text-xs bg-secondary/50 border border-border rounded-lg"
                    >
                      {columnNumbers.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Save Config */}
          <button
            onClick={saveFormatConfig}
            disabled={savingConfig}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Training Config
          </button>
        </motion.div>

        {/* ========== OCR Matching Test Section ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-secondary/30 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">OCR Bill Matching Test</h2>
              <p className="text-xs text-muted-foreground">
                Upload or capture a bill image to test extraction using the column config above ({allItems.length} items registered)
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
                      />
                    </div>
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

        {/* ========== Font Size Section ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-secondary/30 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Text Size</h2>
              <p className="text-xs text-muted-foreground">Adjust the app text size for better readability</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[{ key: 'small', label: 'S', desc: 'Small' }, { key: 'medium', label: 'M', desc: 'Medium' }, { key: 'large', label: 'L', desc: 'Large' }].map(s => (
              <button key={s.key} onClick={() => applyFontSize(s.key)}
                className={cn("flex-1 py-3 rounded-xl text-center transition-all", fontSize === s.key ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary")}>
                <span className="text-lg font-bold">{s.label}</span>
                <p className="text-[10px] mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ========== Payment Methods Section ========== */}
        <PaymentMethodSettings />

        {/* ========== Change Password Section ========== */}
        <ChangePasswordSection />


        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-semibold text-destructive">Reset Database</h2>
              <p className="text-xs text-muted-foreground">
                This will permanently delete ALL transactions, bills, drawer data, and reset all balances. This action cannot be undone.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Type <span className="font-bold text-destructive">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="Type RESET here..."
              className="w-full h-10 px-4 bg-background border border-destructive/30 rounded-xl text-sm focus:ring-2 focus:ring-destructive/50"
            />
          </div>

          <button
            onClick={handleResetDatabase}
            disabled={isResetting || resetConfirm !== 'RESET'}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isResetting ? 'Resetting...' : 'Erase All Data'}
          </button>
        </motion.div>
      </div>
    </AppLayout>
  );
}

function PaymentMethodSettings() {
  const defaultMethods = [
    { id: 'cash', name: 'Cash', reset: 'none', editable: false },
    { id: 'upi', name: 'UPI', reset: 'daily', editable: false },
    { id: 'cheque', name: 'Cheque', reset: 'none', editable: false },
    { id: 'adjust', name: 'Adjust', reset: 'daily', editable: false },
  ];

  const [methods, setMethods] = useState(() => {
    const stored = localStorage.getItem('payment-methods');
    return stored ? JSON.parse(stored) : defaultMethods;
  });
  const [newName, setNewName] = useState('');
  const [newReset, setNewReset] = useState('none');

  const save = (updated: any[]) => {
    setMethods(updated);
    localStorage.setItem('payment-methods', JSON.stringify(updated));
    window.dispatchEvent(new Event('payment-methods-changed'));
    toast.success('Payment methods saved');
  };

  const addMethod = () => {
    if (!newName.trim()) return;
    const id = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (methods.find((m: any) => m.id === id)) { toast.error('Already exists'); return; }
    save([...methods, { id, name: newName.trim(), reset: newReset, editable: true }]);
    setNewName('');
    setNewReset('none');
  };

  const removeMethod = (id: string) => {
    save(methods.filter((m: any) => m.id !== id));
  };

  const updateReset = (id: string, reset: string) => {
    save(methods.map((m: any) => m.id === id ? { ...m, reset } : m));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="bg-secondary/30 rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Payment Methods</h2>
          <p className="text-xs text-muted-foreground">Manage payment modes and their reset behavior</p>
        </div>
      </div>

      <div className="space-y-2">
        {methods.map((m: any) => (
          <div key={m.id} className={cn(
            "flex items-center justify-between bg-background rounded-lg p-3 border",
            m.id === 'adjust' ? "border-primary/30" : "border-border"
          )}>
            <div>
              <span className="text-sm font-medium">{m.name}</span>
              {m.id === 'adjust' && <span className="text-[10px] text-primary ml-1">(net must = 0)</span>}
            </div>
            <div className="flex items-center gap-2">
              <select value={m.reset} onChange={e => updateReset(m.id, e.target.value)}
                className="h-7 px-2 text-[11px] bg-secondary/50 border border-border rounded-lg">
                <option value="none">No Reset</option>
                <option value="daily">Reset Daily</option>
                <option value="monthly">Reset Monthly</option>
              </select>
              {m.editable && (
                <button onClick={() => removeMethod(m.id)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New method name..."
          className="flex-1 h-9 px-3 text-sm bg-background border border-border rounded-lg" />
        <select value={newReset} onChange={e => setNewReset(e.target.value)}
          className="h-9 px-2 text-xs bg-background border border-border rounded-lg">
          <option value="none">No Reset</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
        </select>
        <button onClick={addMethod} className="h-9 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90">
          Add
        </button>
      </div>
    </motion.div>
  );
}

function ChangePasswordSection() {
  const { user, isAdmin } = useAuth();
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; role: string; display_name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createRole, setCreateRole] = useState('employee');

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    const { data } = await supabase.functions.invoke('manage-users', {
      body: { action: 'list' },
    });
    if (data?.users) setAllUsers(data.users);
  };

  if (!isAdmin) return null;

  const selectedUser = allUsers.find(u => u.id === selectedUserId);

  const handleCreateUser = async () => {
    if (!createUsername.trim() || !createPassword.trim()) { toast.error('Username and password required'); return; }
    if (createPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'create', username: createUsername.trim(), password: createPassword, role: createRole, display_name: createDisplayName.trim() || createUsername.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('User created successfully');
      setCreateUsername(''); setCreatePassword(''); setCreateDisplayName(''); setCreateRole('employee'); setShowCreateUser(false);
      loadUsers();
    } catch (err: any) { toast.error(err.message || 'Failed to create user'); } finally { setSaving(false); }
  };

  const handleChangeUsername = async () => {
    if (!selectedUserId) { toast.error('Select a user'); return; }
    if (!newUsername.trim() || newUsername.trim().length < 3) { toast.error('Username must be at least 3 characters'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'update-username', user_id: selectedUserId, username: newUsername.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Username changed successfully');
      setNewUsername('');
      loadUsers();
    } catch (err: any) { toast.error(err.message || 'Failed to change username'); } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!selectedUserId) { toast.error('Select a user'); return; }
    if (!newPassword.trim()) { toast.error('New password required'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'update-password', user_id: selectedUserId, password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Password changed successfully');
      setNewPassword(''); setConfirmPassword('');
    } catch (err: any) { toast.error(err.message || 'Failed to change password'); } finally { setSaving(false); }
  };

  const handleDeleteUser = async () => {
    if (!selectedUserId || selectedUserId === user?.id) { toast.error('Cannot delete your own account'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', user_id: selectedUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('User deleted');
      setSelectedUserId('');
      loadUsers();
    } catch (err: any) { toast.error(err.message || 'Failed to delete user'); } finally { setSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.19 }}
      className="bg-secondary/30 rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">User Account Management</h2>
            <p className="text-xs text-muted-foreground">Create, edit, or remove user accounts (Admin only)</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreateUser(!showCreateUser)}>
          {showCreateUser ? 'Cancel' : '+ New User'}
        </Button>
      </div>

      {showCreateUser && (
        <div className="bg-background/50 rounded-xl p-3 space-y-2 border border-primary/30">
          <label className="text-xs font-semibold text-foreground block">Create New User</label>
          <Input value={createDisplayName} onChange={e => setCreateDisplayName(e.target.value)} placeholder="Display name" className="h-9" />
          <Input value={createUsername} onChange={e => setCreateUsername(e.target.value)} placeholder="Login username" className="h-9" />
          <Input type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="Password (min 6 chars)" className="h-9" />
          <Select value={createRole} onValueChange={setCreateRole}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreateUser} disabled={saving} className="w-full h-9">
            {saving ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select User</label>
        <Select value={selectedUserId} onValueChange={(v) => {
          setSelectedUserId(v);
          const u = allUsers.find(u => u.id === v);
          setNewUsername(u?.username || '');
          setNewPassword(''); setConfirmPassword('');
        }}>
          <SelectTrigger className="h-10"><SelectValue placeholder="Select user..." /></SelectTrigger>
          <SelectContent>
            {allUsers.map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.display_name || u.username} <span className="text-muted-foreground">({u.role})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedUserId && (
        <>
          <div className="bg-background/50 rounded-xl p-3 space-y-2 border border-border">
            <label className="text-xs font-semibold text-foreground block">Change Username (Login ID)</label>
            <div className="flex gap-2">
              <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="New username" className="h-9 flex-1" />
              <Button size="sm" onClick={handleChangeUsername} disabled={saving || newUsername === selectedUser?.username} className="h-9">Update ID</Button>
            </div>
          </div>

          <div className="bg-background/50 rounded-xl p-3 space-y-2 border border-border">
            <label className="text-xs font-semibold text-foreground block">Change Password</label>
            <div className="relative">
              <Input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" className="h-9 pr-10" />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-9" />
            <Button onClick={handleChangePassword} disabled={saving} className="w-full h-9 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {saving ? 'Changing...' : 'Change Password'}
            </Button>
          </div>

          {selectedUserId !== user?.id && (
            <Button variant="destructive" size="sm" onClick={handleDeleteUser} disabled={saving} className="w-full h-9 gap-2">
              <Trash2 className="w-4 h-4" /> Delete User
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
}
