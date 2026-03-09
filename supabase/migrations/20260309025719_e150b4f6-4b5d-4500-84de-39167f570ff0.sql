-- Update RLS policies on all tables to require authenticated role
-- This ensures only logged-in users can access data

-- advance_purposes
DROP POLICY IF EXISTS "Authenticated access" ON public.advance_purposes;
CREATE POLICY "Authenticated users only" ON public.advance_purposes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bill_items
DROP POLICY IF EXISTS "Authenticated access" ON public.bill_items;
CREATE POLICY "Authenticated users only" ON public.bill_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- home_categories
DROP POLICY IF EXISTS "Authenticated access" ON public.home_categories;
CREATE POLICY "Authenticated users only" ON public.home_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- suppliers
DROP POLICY IF EXISTS "Authenticated access" ON public.suppliers;
CREATE POLICY "Authenticated users only" ON public.suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- categories
DROP POLICY IF EXISTS "Authenticated access" ON public.categories;
CREATE POLICY "Authenticated users only" ON public.categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- drawer_openings
DROP POLICY IF EXISTS "Authenticated access" ON public.drawer_openings;
CREATE POLICY "Authenticated users only" ON public.drawer_openings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- items
DROP POLICY IF EXISTS "Authenticated access" ON public.items;
CREATE POLICY "Authenticated users only" ON public.items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- transactions
DROP POLICY IF EXISTS "Authenticated access" ON public.transactions;
CREATE POLICY "Authenticated users only" ON public.transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- batches
DROP POLICY IF EXISTS "Authenticated access" ON public.batches;
CREATE POLICY "Authenticated users only" ON public.batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bills
DROP POLICY IF EXISTS "Authenticated access" ON public.bills;
CREATE POLICY "Authenticated users only" ON public.bills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- salary_categories
DROP POLICY IF EXISTS "Authenticated access" ON public.salary_categories;
CREATE POLICY "Authenticated users only" ON public.salary_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bill_format_config
DROP POLICY IF EXISTS "Authenticated access" ON public.bill_format_config;
CREATE POLICY "Authenticated users only" ON public.bill_format_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- employees
DROP POLICY IF EXISTS "Authenticated access" ON public.employees;
CREATE POLICY "Authenticated users only" ON public.employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- drawer_closings
DROP POLICY IF EXISTS "Authenticated access" ON public.drawer_closings;
CREATE POLICY "Authenticated users only" ON public.drawer_closings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- expense_categories
DROP POLICY IF EXISTS "Authenticated access" ON public.expense_categories;
CREATE POLICY "Authenticated users only" ON public.expense_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "Authenticated access" ON public.customers;
CREATE POLICY "Authenticated users only" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- welders
DROP POLICY IF EXISTS "Authenticated access" ON public.welders;
CREATE POLICY "Authenticated users only" ON public.welders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- exchanges
DROP POLICY IF EXISTS "Authenticated access" ON public.exchanges;
CREATE POLICY "Authenticated users only" ON public.exchanges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon to check user_roles count for bootstrap detection
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
CREATE POLICY "Anyone can count roles for bootstrap" ON public.user_roles
  FOR SELECT TO anon, authenticated USING (true);