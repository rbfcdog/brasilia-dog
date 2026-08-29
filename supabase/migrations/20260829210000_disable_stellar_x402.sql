update public.product_endpoints
set enabled = false
where offering_id in (
  select id
  from public.product_payment_offerings
  where rail = 'stellar_x402'
);

update public.product_payment_offerings
set active = false
where rail = 'stellar_x402';
