-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  batch_preference TEXT NOT NULL DEFAULT 'latest' CHECK (batch_preference IN ('latest', 'oldest', 'custom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items table  
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  batch_preference TEXT NOT NULL DEFAULT 'category' CHECK (batch_preference IN ('latest', 'oldest', 'custom', 'category')),
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  secondary_unit TEXT,
  conversion_rate DECIMAL(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batches table (core of batch management)
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  batch_number TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  primary_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  secondary_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  advance_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  advance_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  section TEXT NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payments JSONB NOT NULL DEFAULT '[]',
  bill_number TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reference TEXT,
  bill_type TEXT,
  due DECIMAL(12,2),
  overpayment DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bills table (linked to transactions)
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  bill_type TEXT,
  bill_number TEXT,
  customer_name TEXT,
  supplier_name TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bill Items table
CREATE TABLE public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  primary_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  secondary_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0
);

-- Drawer Openings table
CREATE TABLE public.drawer_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  upi DECIMAL(12,2) NOT NULL DEFAULT 0,
  bank DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drawer Closings table
CREATE TABLE public.drawer_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  actual_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  difference DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exchanges table
CREATE TABLE public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_mode TEXT NOT NULL,
  to_mode TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_batches_item_id ON public.batches(item_id);
CREATE INDEX idx_batches_purchase_date ON public.batches(purchase_date DESC);
CREATE INDEX idx_transactions_date ON public.transactions(date);
CREATE INDEX idx_transactions_section ON public.transactions(section);
CREATE INDEX idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX idx_items_category_id ON public.items(category_id);

-- Enable RLS on all tables (public access for now - can add auth later)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawer_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawer_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;

-- Create public access policies (for now - no auth required)
CREATE POLICY "Allow all access to categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to items" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to batches" ON public.batches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bill_items" ON public.bill_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to drawer_openings" ON public.drawer_openings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to drawer_closings" ON public.drawer_closings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to exchanges" ON public.exchanges FOR ALL USING (true) WITH CHECK (true);

-- Function to update batch quantities when bill item is created (for sales - deduct)
CREATE OR REPLACE FUNCTION public.update_batch_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE public.batches
    SET primary_quantity = primary_quantity - NEW.primary_quantity,
        secondary_quantity = secondary_quantity - NEW.secondary_quantity
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to create batch from purchase bill
CREATE OR REPLACE FUNCTION public.create_batch_from_purchase()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id UUID;
BEGIN
  -- Only for purchase bills (check if parent bill belongs to a purchase transaction)
  IF NEW.item_id IS NOT NULL THEN
    -- Create new batch or update existing one with same batch number
    INSERT INTO public.batches (item_id, batch_number, purchase_date, purchase_rate, primary_quantity, secondary_quantity)
    VALUES (NEW.item_id, 
            (SELECT bill_number FROM public.bills WHERE id = NEW.bill_id), 
            CURRENT_DATE, 
            NEW.rate, 
            NEW.primary_quantity, 
            NEW.secondary_quantity);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;