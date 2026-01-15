-- Expense categories table
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to expense_categories" ON public.expense_categories FOR ALL USING (true) WITH CHECK (true);

-- Add expense_category_id to transactions if not exists
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS expense_category_id UUID REFERENCES public.expense_categories(id);

-- Insert default expense categories
INSERT INTO public.expense_categories (name, description) VALUES
  ('Vehicle Expenses', 'Fuel, maintenance, repairs'),
  ('Workshop Expenses', 'Tools, materials, utilities'),
  ('Other Expenses', 'Miscellaneous expenses')
ON CONFLICT DO NOTHING;