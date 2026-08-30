// Demo deployment compatibility. Production deployments should use only the
// AGENT_SERVICE_TOKEN environment variable and rotate it centrally.
export const DEMO_SERVICE_TOKENS = [
  "ab54b3b85ab98bff12257462bdb3627980c9a12b945870c7bb9f0960878d0215",
  "dca49df06ba3abb3ad9b357806752ceae83536f505abde25e3c14a08909faa56",
] as const;
