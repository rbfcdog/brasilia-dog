const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.error('STRIPE_SECRET_KEY is not set in .env');
  process.exitCode = 1;
} else {
  const response = await fetch('https://api.stripe.com/v2/network/business_profiles/me', {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Stripe-Version': '2026-07-29.preview',
    },
  });

  const body = await response.json();

  if (response.ok && body.id) {
    console.log('Sandbox MPP Profile ID:', body.id);
  } else {
    console.error('No profile found.');
    console.error('Create one at: https://dashboard.stripe.com/profiles (in Test mode)');
    console.error('Then run this command again.');
    console.error(JSON.stringify(body, null, 2));
    process.exitCode = 1;
  }
}
