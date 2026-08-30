-- Provision a diverse agent-readable Stripe MPP catalog. Products remain inactive
-- until an operator supplies the API's exact sandbox Stripe profile ID through
-- activate_agent_mpp_seed_catalog(). Live profiles are deliberately rejected.

create temporary table agent_mpp_seed_products (
  slug text primary key,
  name text not null,
  description text not null,
  category text not null,
  amount_minor bigint not null
) on commit drop;

insert into agent_mpp_seed_products (slug, name, description, category, amount_minor) values
  ('ultrawide-monitor-buying-guide', 'Ultrawide monitor buying guide', 'Current comparison data for ultrawide monitors, panels, ports, and ergonomics.', 'electronics', 250),
  ('mechanical-keyboard-switch-report', 'Mechanical keyboard switch report', 'Current switch, layout, firmware, and availability comparison.', 'electronics', 175),
  ('noise-cancelling-headphone-index', 'Noise-cancelling headphone index', 'Current headphone pricing, codec, battery, and comfort data.', 'electronics', 225),
  ('usb-c-dock-compatibility-matrix', 'USB-C dock compatibility matrix', 'Current dock compatibility across laptops, displays, and power profiles.', 'electronics', 150),
  ('portable-ssd-market-scan', 'Portable SSD market scan', 'Current portable SSD performance, endurance, warranty, and price data.', 'electronics', 200),
  ('wifi-router-security-brief', 'Wi-Fi router security brief', 'Current router security, update policy, radio, and throughput comparison.', 'electronics', 180),
  ('smartphone-camera-comparison', 'Smartphone camera comparison', 'Current smartphone imaging hardware and practical camera comparison.', 'electronics', 275),
  ('tablet-productivity-report', 'Tablet productivity report', 'Current tablet accessory, application, display, and battery comparison.', 'electronics', 220),
  ('laptop-battery-life-index', 'Laptop battery life index', 'Current normalized laptop battery-life and charging data.', 'electronics', 240),
  ('home-office-webcam-guide', 'Home office webcam guide', 'Current webcam image, microphone, privacy, and compatibility data.', 'electronics', 125),
  ('running-shoe-fit-index', 'Running shoe fit index', 'Current running shoe geometry, cushioning, durability, and fit data.', 'sports', 160),
  ('hiking-backpack-comparison', 'Hiking backpack comparison', 'Current hiking pack capacity, suspension, weight, and warranty data.', 'sports', 155),
  ('fitness-tracker-feature-matrix', 'Fitness tracker feature matrix', 'Current fitness tracker sensor, battery, privacy, and platform data.', 'sports', 190),
  ('yoga-mat-material-report', 'Yoga mat material report', 'Current yoga mat material, grip, durability, and care comparison.', 'sports', 95),
  ('cycling-helmet-safety-index', 'Cycling helmet safety index', 'Current cycling helmet certification, fit system, and weight data.', 'sports', 140),
  ('camping-tent-weather-guide', 'Camping tent weather guide', 'Current tent capacity, weather resistance, packed weight, and price data.', 'outdoors', 185),
  ('water-filter-performance-report', 'Water filter performance report', 'Current portable water filter standards, flow, life, and maintenance data.', 'outdoors', 130),
  ('travel-luggage-durability-index', 'Travel luggage durability index', 'Current luggage material, wheel, warranty, capacity, and price data.', 'travel', 170),
  ('carry-on-airline-size-matrix', 'Carry-on airline size matrix', 'Current carry-on size and weight limits across major airlines.', 'travel', 110),
  ('travel-adapter-compatibility-guide', 'Travel adapter compatibility guide', 'Current plug, voltage, USB charging, and safety compatibility data.', 'travel', 90),
  ('espresso-machine-feature-index', 'Espresso machine feature index', 'Current espresso machine thermal, grinder, workflow, and service data.', 'home', 260),
  ('air-purifier-room-index', 'Air purifier room index', 'Current clean-air delivery, filter, noise, and room-size comparison.', 'home', 195),
  ('robot-vacuum-navigation-report', 'Robot vacuum navigation report', 'Current navigation, obstacle avoidance, cleaning, and privacy comparison.', 'home', 230),
  ('induction-cookware-compatibility', 'Induction cookware compatibility', 'Current induction cookware material, size, durability, and value data.', 'home', 120),
  ('mattress-material-comparison', 'Mattress material comparison', 'Current mattress construction, firmness, trial, warranty, and price data.', 'home', 210),
  ('office-chair-ergonomics-index', 'Office chair ergonomics index', 'Current office chair adjustment, support, warranty, and size data.', 'home', 245),
  ('led-desk-lamp-report', 'LED desk lamp report', 'Current desk lamp illumination, flicker, controls, and power data.', 'home', 85),
  ('home-security-camera-matrix', 'Home security camera matrix', 'Current camera storage, privacy, detection, and subscription comparison.', 'home', 205),
  ('smart-thermostat-compatibility', 'Smart thermostat compatibility', 'Current HVAC compatibility, privacy, automation, and savings data.', 'home', 165),
  ('cordless-drill-value-index', 'Cordless drill value index', 'Current drill torque, battery ecosystem, ergonomics, and warranty data.', 'tools', 145),
  ('project-management-software-index', 'Project management software index', 'Current project management pricing, controls, integrations, and limits.', 'software', 300),
  ('password-manager-security-report', 'Password manager security report', 'Current password manager architecture, recovery, audit, and pricing data.', 'software', 280),
  ('cloud-backup-pricing-matrix', 'Cloud backup pricing matrix', 'Current backup retention, restore, security, and pricing comparison.', 'software', 260),
  ('video-conferencing-platform-guide', 'Video conferencing platform guide', 'Current conferencing capacity, accessibility, administration, and price data.', 'software', 225),
  ('accounting-software-small-business', 'Small-business accounting software', 'Current accounting automation, reporting, integration, and pricing data.', 'software', 275),
  ('crm-platform-feature-index', 'CRM platform feature index', 'Current CRM workflow, data portability, automation, and pricing comparison.', 'software', 320),
  ('email-marketing-platform-report', 'Email marketing platform report', 'Current deliverability, automation, compliance, and pricing data.', 'software', 235),
  ('vpn-provider-privacy-index', 'VPN provider privacy index', 'Current VPN protocol, ownership, audit, jurisdiction, and pricing data.', 'software', 215),
  ('web-hosting-performance-index', 'Web hosting performance index', 'Current hosting performance, limits, support, security, and price data.', 'software', 250),
  ('developer-api-monitoring-guide', 'Developer API monitoring guide', 'Current API monitoring, alerting, retention, integration, and pricing data.', 'software', 290),
  ('electricity-plan-rate-comparison', 'Electricity plan rate comparison', 'Current plan rates, fees, contract terms, and renewable content data.', 'services', 185),
  ('mobile-plan-coverage-index', 'Mobile plan coverage index', 'Current mobile coverage, throttling, roaming, fee, and price data.', 'services', 195),
  ('home-internet-plan-matrix', 'Home internet plan matrix', 'Current speed, data cap, equipment, contract, and pricing data.', 'services', 205),
  ('car-insurance-coverage-guide', 'Car insurance coverage guide', 'Current coverage definitions, exclusions, service, and quote factors.', 'services', 240),
  ('pet-insurance-policy-index', 'Pet insurance policy index', 'Current policy limits, exclusions, waiting periods, and pricing factors.', 'services', 210),
  ('online-course-platform-guide', 'Online course platform guide', 'Current course catalog, credential, accessibility, and pricing data.', 'education', 175),
  ('language-learning-app-index', 'Language learning app index', 'Current language coverage, pedagogy, offline use, and pricing data.', 'education', 150),
  ('ebook-reader-ecosystem-report', 'E-book reader ecosystem report', 'Current display, format, library, accessibility, and ecosystem data.', 'education', 165),
  ('meal-kit-service-comparison', 'Meal kit service comparison', 'Current menu, dietary support, packaging, delivery, and price data.', 'food', 135),
  ('coffee-subscription-origin-index', 'Coffee subscription origin index', 'Current coffee origin, roast, freshness, shipping, and price data.', 'food', 115);

insert into public.products (slug, name, description, status, metadata)
select
  slug,
  name,
  description,
  'draft',
  jsonb_build_object('category', category, 'seed', 'agent_catalog_20260830')
from agent_mpp_seed_products
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  metadata = excluded.metadata;

insert into public.product_payment_offerings (
  product_id,
  rail,
  amount_minor,
  currency,
  scale,
  network_id,
  active
)
select
  products.id,
  'stripe_mpp',
  seed.amount_minor,
  'usd',
  2,
  'profile_test_replace_before_activation',
  false
from agent_mpp_seed_products seed
join public.products products on products.slug = seed.slug
on conflict (product_id, rail) do update
set
  amount_minor = excluded.amount_minor,
  currency = excluded.currency,
  scale = excluded.scale;

insert into public.product_endpoints (
  offering_id,
  method,
  path,
  response_status,
  response_body,
  enabled
)
select
  offerings.id,
  'GET',
  '/v1/products/' || products.slug || '/mpp',
  200,
  jsonb_build_object(
    'product', products.slug,
    'description', products.description,
    'source', 'stripe_mpp_catalog'
  ),
  false
from agent_mpp_seed_products seed
join public.products products on products.slug = seed.slug
join public.product_payment_offerings offerings
  on offerings.product_id = products.id and offerings.rail = 'stripe_mpp'
on conflict (method, path) do update
set
  response_status = excluded.response_status,
  response_body = excluded.response_body;

create or replace function public.activate_agent_mpp_seed_catalog(p_network_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  activated_count integer;
begin
  if p_network_id is null or p_network_id !~ '^profile_test_' then
    raise exception 'Only an explicit Stripe sandbox profile_test_ network may activate the seeded catalog.';
  end if;

  update public.products
  set status = 'published'
  where metadata->>'seed' = 'agent_catalog_20260830';

  update public.product_payment_offerings offerings
  set network_id = p_network_id, active = true
  from public.products products
  where products.id = offerings.product_id
    and products.metadata->>'seed' = 'agent_catalog_20260830'
    and offerings.rail = 'stripe_mpp';

  update public.product_endpoints endpoints
  set enabled = true
  from public.product_payment_offerings offerings
  join public.products products on products.id = offerings.product_id
  where endpoints.offering_id = offerings.id
    and products.metadata->>'seed' = 'agent_catalog_20260830';

  get diagnostics activated_count = row_count;
  return activated_count;
end;
$$;

revoke all on function public.activate_agent_mpp_seed_catalog(text) from public;
