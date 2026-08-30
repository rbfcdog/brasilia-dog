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
      SESSION_SECRET: preserve(),
      AGENT_SERVICE_TOKEN: preserve(),
    },
  });

  const agent = service("agent", {
    source: github("rbfcdog/brasilia-dog", {
      rootDirectory: "agent",
    }),
    healthcheck: "/health",
    healthcheckTimeout: 30,
    env: {
      AGENT_SERVICE_TOKEN: preserve(),
      OPENAI_API_KEY: preserve(),
      OPENAI_MODEL: preserve(),
      ADAPTER_MODE: preserve(),
    },
  });

  return project("brasilia-dog", {
    resources: [api, agent],
  });
});
