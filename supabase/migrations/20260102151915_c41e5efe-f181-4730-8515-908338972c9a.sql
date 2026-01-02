-- Add give_back column to transactions table for tracking overpayment returns
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS give_back jsonb DEFAULT '[]'::jsonb;

-- Add adjusted_from_sales column for expenses paid from sales cash
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS adjusted_from_sales numeric DEFAULT 0;