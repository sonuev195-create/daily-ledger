
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  display_name text,
  created_by uuid REFERENCES public.app_users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.app_users (username, password, role, display_name)
VALUES 
  ('admin_123', 'admin_abcd123', 'admin', 'Administrator'),
  ('emp_123', 'emp_abcd', 'employee', 'Employee');
