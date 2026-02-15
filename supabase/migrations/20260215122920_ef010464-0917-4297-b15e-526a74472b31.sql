
-- Table to store paper bill column format configuration (training)
CREATE TABLE public.bill_format_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_name text NOT NULL DEFAULT 'default',
  bill_type text NOT NULL DEFAULT 'both', -- 'sale', 'purchase', 'both'
  total_columns integer NOT NULL DEFAULT 4,
  item_name_column integer NOT NULL DEFAULT 1,
  quantity_column integer NOT NULL DEFAULT 2,
  quantity_type text NOT NULL DEFAULT 'primary', -- 'primary' or 'secondary'
  rate_column integer, -- nullable if not present
  amount_column integer NOT NULL DEFAULT 3,
  has_rate boolean NOT NULL DEFAULT false,
  has_amount boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_format_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to bill_format_config"
ON public.bill_format_config
FOR ALL
USING (true)
WITH CHECK (true);
