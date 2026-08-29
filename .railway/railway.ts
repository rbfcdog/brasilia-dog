import { defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const api = service("api", {
    source: github("rbfcdog/brasilia-dog", {
      rootDirectory: "api",
    }),
    healthcheck: "/health",
    healthcheckTimeout: 30,
    env: {
      STRIPE_MODE: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_PROFILE_ID: preserve(),
      MPP_SECRET_KEY: preserve(),
    },
  });

  return project("brasilia-dog", {
    resources: [api],
  });
});
