
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. RLS for profiles
CREATE POLICY "Authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. RLS for user_roles
CREATE POLICY "Authenticated can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Replace permissive RLS on ALL existing tables
-- categories
DROP POLICY IF EXISTS "Allow all access to categories" ON public.categories;
CREATE POLICY "Authenticated access" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- items
DROP POLICY IF EXISTS "Allow all access to items" ON public.items;
CREATE POLICY "Authenticated access" ON public.items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- batches
DROP POLICY IF EXISTS "Allow all access to batches" ON public.batches;
CREATE POLICY "Authenticated access" ON public.batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "Allow all access to customers" ON public.customers;
CREATE POLICY "Authenticated access" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- suppliers
DROP POLICY IF EXISTS "Allow all access to suppliers" ON public.suppliers;
CREATE POLICY "Authenticated access" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- employees
DROP POLICY IF EXISTS "Allow all access to employees" ON public.employees;
CREATE POLICY "Authenticated access" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- transactions
DROP POLICY IF EXISTS "Allow all access to transactions" ON public.transactions;
CREATE POLICY "Authenticated access" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bills
DROP POLICY IF EXISTS "Allow all access to bills" ON public.bills;
CREATE POLICY "Authenticated access" ON public.bills FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bill_items
DROP POLICY IF EXISTS "Allow all access to bill_items" ON public.bill_items;
CREATE POLICY "Authenticated access" ON public.bill_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- drawer_openings
DROP POLICY IF EXISTS "Allow all access to drawer_openings" ON public.drawer_openings;
CREATE POLICY "Authenticated access" ON public.drawer_openings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- drawer_closings
DROP POLICY IF EXISTS "Allow all access to drawer_closings" ON public.drawer_closings;
CREATE POLICY "Authenticated access" ON public.drawer_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- exchanges
DROP POLICY IF EXISTS "Allow all access to exchanges" ON public.exchanges;
CREATE POLICY "Authenticated access" ON public.exchanges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- salary_categories
DROP POLICY IF EXISTS "Allow all access to salary_categories" ON public.salary_categories;
CREATE POLICY "Authenticated access" ON public.salary_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- expense_categories
DROP POLICY IF EXISTS "Allow all access to expense_categories" ON public.expense_categories;
CREATE POLICY "Authenticated access" ON public.expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- home_categories
DROP POLICY IF EXISTS "Allow all access to home_categories" ON public.home_categories;
CREATE POLICY "Authenticated access" ON public.home_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- advance_purposes
DROP POLICY IF EXISTS "Allow all access to advance_purposes" ON public.advance_purposes;
CREATE POLICY "Authenticated access" ON public.advance_purposes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- welders
DROP POLICY IF EXISTS "Allow all access to welders" ON public.welders;
CREATE POLICY "Authenticated access" ON public.welders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bill_format_config
DROP POLICY IF EXISTS "Allow all access to bill_format_config" ON public.bill_format_config;
CREATE POLICY "Authenticated access" ON public.bill_format_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- app_users - lock down to admins only (legacy table)
DROP POLICY IF EXISTS "Allow all access to app_users" ON public.app_users;
CREATE POLICY "Admins only" ON public.app_users FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
