-- Create salary categories table for employee payments
CREATE TABLE public.salary_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salary_categories ENABLE ROW LEVEL SECURITY;

-- Allow all access
CREATE POLICY "Allow all access to salary_categories"
  ON public.salary_categories
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default salary categories
INSERT INTO public.salary_categories (name, description) VALUES
  ('Daily Salary', 'Regular daily wage payment'),
  ('Previous Balance', 'Payment for previous pending balance'),
  ('Rate Work', 'Piece rate or contract work payment'),
  ('Allowance', 'Additional allowance payments'),
  ('Advance', 'Advance payment to employee'),
  ('Bonus', 'Bonus payment');

-- Add salary_category_id to transactions table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS salary_category_id UUID REFERENCES public.salary_categories(id);

-- Update drawer_openings to have separate coin/cash fields for shop kept tracking
ALTER TABLE public.drawer_openings 
  ADD COLUMN IF NOT EXISTS shop_coin NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shop_cash NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_advance NUMERIC NOT NULL DEFAULT 0;

-- Update drawer_closings for manual closing system
ALTER TABLE public.drawer_closings 
  ADD COLUMN IF NOT EXISTS manual_coin NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_cash NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_to_home NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_cash NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_upi NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_bank NUMERIC NOT NULL DEFAULT 0;