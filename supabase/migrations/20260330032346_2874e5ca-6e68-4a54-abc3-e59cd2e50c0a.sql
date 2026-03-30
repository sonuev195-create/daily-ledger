
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS computer_bill_number text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bill_classification text DEFAULT 'b2c';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS details text;
