
-- Create allowance_categories table
CREATE TABLE public.allowance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowance_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON public.allowance_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create rate_work_types table
CREATE TABLE public.rate_work_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON public.rate_work_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add new columns to transactions table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS allowance_category_id uuid REFERENCES public.allowance_categories(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS rate_work_type_id uuid REFERENCES public.rate_work_types(id);
