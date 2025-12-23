import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Camera, Upload, FileText } from 'lucide-react';
import { BillItem, Bill } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BillSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (items: BillItem[], totalAmount: number, imageUrl?: string) => void;
  existingItems?: BillItem[];
}

export function BillSheet({ isOpen, onClose, onSave, existingItems = [] }: BillSheetProps) {
  const [items, setItems] = useState<BillItem[]>(
    existingItems.length > 0 ? existingItems : [createEmptyItem()]
  );
  const [activeTab, setActiveTab] = useState('manual');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function createEmptyItem(): BillItem {
    return {
      id: uuidv4(),
      itemName: '',
      primaryQuantity: 0,
      secondaryQuantity: 0,
      rate: 0,
      totalAmount: 0,
    };
  }

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof BillItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Don't auto-calculate, keep all editable
        return updated;
      }
      return item;
    }));
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  const handleSave = () => {
    const validItems = items.filter(item => item.itemName.trim() !== '');
    onSave(validItems, totalAmount, capturedImage || undefined);
    onClose();
  };

  const handleCapture = () => {
    // For now, open file picker for camera
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.capture = 'environment';
      fileInputRef.current.click();
    }
  };

  const handleUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*,.pdf';
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        // Here you would integrate OCR - for now just show the image
      };
      reader.readAsDataURL(file);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">Add Bill Items</SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-6 mt-4 grid grid-cols-3 bg-secondary/50">
              <TabsTrigger value="manual" className="data-[state=active]:bg-background">
                <FileText className="w-4 h-4 mr-2" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="capture" className="data-[state=active]:bg-background">
                <Camera className="w-4 h-4 mr-2" />
                Capture
              </TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-background">
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <div className="space-y-4">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-secondary/30 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                      {items.length > 1 && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-destructive hover:bg-destructive/10 p-1 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) => updateItem(item.id, 'itemName', e.target.value)}
                      placeholder="Item Name"
                      className="input-field"
                    />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Primary Qty</label>
                        <input
                          type="number"
                          value={item.primaryQuantity || ''}
                          onChange={(e) => updateItem(item.id, 'primaryQuantity', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Secondary Qty</label>
                        <input
                          type="number"
                          value={item.secondaryQuantity || ''}
                          onChange={(e) => updateItem(item.id, 'secondaryQuantity', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="input-field"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Rate</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                          <input
                            type="number"
                            value={item.rate || ''}
                            onChange={(e) => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="input-field pl-7"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Total</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                          <input
                            type="number"
                            value={item.totalAmount || ''}
                            onChange={(e) => updateItem(item.id, 'totalAmount', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="input-field pl-7"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                <button
                  onClick={addItem}
                  className="w-full py-3 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
            </TabsContent>

            <TabsContent value="capture" className="flex-1 px-6 py-4 mt-0">
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {capturedImage ? (
                  <div className="relative w-full max-w-sm">
                    <img src={capturedImage} alt="Captured bill" className="w-full rounded-xl" />
                    <button
                      onClick={() => setCapturedImage(null)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground p-2 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center">
                      <Camera className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-center">
                      Capture a photo of your bill to extract items automatically
                    </p>
                    <button onClick={handleCapture} className="btn-accent px-6 py-3">
                      Open Camera
                    </button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="flex-1 px-6 py-4 mt-0">
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {capturedImage ? (
                  <div className="relative w-full max-w-sm">
                    <img src={capturedImage} alt="Uploaded bill" className="w-full rounded-xl" />
                    <button
                      onClick={() => setCapturedImage(null)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground p-2 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center">
                      <Upload className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-center">
                      Upload a bill image or PDF to extract items
                    </p>
                    <button onClick={handleUpload} className="btn-accent px-6 py-3">
                      Choose File
                    </button>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Footer with Total */}
          <div className="px-6 py-4 border-t border-border bg-background">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">Bill Total</span>
              <span className="text-2xl font-bold text-foreground">{formatCurrency(totalAmount)}</span>
            </div>
            <button
              onClick={handleSave}
              disabled={items.every(item => !item.itemName.trim())}
              className="btn-accent w-full py-3 disabled:opacity-50"
            >
              Save Bill Items
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
