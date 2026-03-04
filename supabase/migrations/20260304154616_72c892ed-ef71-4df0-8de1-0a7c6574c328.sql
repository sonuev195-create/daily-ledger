
-- Create home_categories table
CREATE TABLE public.home_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.home_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to home_categories" ON public.home_categories FOR ALL USING (true) WITH CHECK (true);

-- Insert default categories
INSERT INTO public.home_categories (name) VALUES ('Advance'), ('Closing'), ('Bank'), ('Chitty'), ('Other');

-- Add home_category_id to transactions
ALTER TABLE public.transactions ADD COLUMN home_category_id uuid REFERENCES public.home_categories(id);

-- Add delivered_date to bills
ALTER TABLE public.bills ADD COLUMN delivered_date date;
