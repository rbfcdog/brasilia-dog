# Stripe profile lookup

Run this in a terminal using your sandbox test secret key.

## Command

```bash
curl --silent --show-error \
  https://api.stripe.com/v2/network/business_profiles/me \
  -u "sk_test_REPLACE_WITH_YOUR_TEST_KEY:" \
  -H "Stripe-Version: 2026-07-29.preview" \
  | jq -r '.id'
```

## Expected output

```
profile_test_...
```

## Notes

- Use a sandbox `sk_test_` key, not a live `sk_live_` key.
- The test key is safe to paste into your local terminal.
- Do not paste the key into chat, Git, or any file.
- Put the resulting `profile_test_...` value into the `STRIPE_PROFILE_ID` Railway Variable.
- If the command returns empty or errors, your Stripe account may not have a business profile yet. Create one in Stripe Dashboard under Test mode.
