
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Initialize sort_order based on current alphabetical order for categories
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as rn FROM public.categories
)
UPDATE public.categories SET sort_order = ranked.rn FROM ranked WHERE categories.id = ranked.id;

-- Initialize sort_order based on current alphabetical order for items
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as rn FROM public.items
)
UPDATE public.items SET sort_order = ranked.rn FROM ranked WHERE items.id = ranked.id;
