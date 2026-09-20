CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  out_trade_no text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  plan_name text NOT NULL,
  billing_cycle text NOT NULL,
  amount numeric(10,2) NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  trade_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX idx_payment_orders_user ON public.payment_orders(user_id);
CREATE INDEX idx_payment_orders_out_trade_no ON public.payment_orders(out_trade_no);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_orders" ON public.payment_orders
  FOR SELECT USING (user_id = auth.uid());