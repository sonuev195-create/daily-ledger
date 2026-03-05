
-- Create welders table
CREATE TABLE public.welders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.welders ENABLE ROW LEVEL SECURITY;

-- Allow all access (matching existing pattern)
CREATE POLICY "Allow all access to welders" ON public.welders FOR ALL USING (true) WITH CHECK (true);

-- Add welder_id to transactions
ALTER TABLE public.transactions ADD COLUMN welder_id uuid REFERENCES public.welders(id);
