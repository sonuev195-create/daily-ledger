-- Create advance_purposes table for tracking purposes
CREATE TABLE public.advance_purposes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.advance_purposes ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for all access
CREATE POLICY "Allow all access to advance_purposes" ON public.advance_purposes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default purposes
INSERT INTO public.advance_purposes (name) VALUES 
  ('Advance Payment'),
  ('Booking'),
  ('Order Deposit'),
  ('Pre-payment'),
  ('Other');

-- Add purpose field to transactions for advance tracking
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS advance_purpose_id UUID REFERENCES public.advance_purposes(id);

-- Add advance_rate to transactions (for when advance is taken with specific rate info)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS advance_rate NUMERIC DEFAULT 0;