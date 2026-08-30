const agentServiceToken = process.env.AGENT_SERVICE_TOKEN?.trim();
if (!agentServiceToken) {
  console.error("AGENT_SERVICE_TOKEN is required for the local readiness checks.");
  process.exit(1);
}

const agentAuthorization = { Authorization: `Bearer ${agentServiceToken}` };
const checks = [
  {
    name: "api",
    url: "http://127.0.0.1:3000/health",
    validate: async (response) => (await response.json()).status === "ok",
  },
  {
    name: "agent",
    url: "http://127.0.0.1:3001/health",
    validate: async (response) => (await response.json()).status === "ok",
  },
  {
    name: "front",
    url: "http://127.0.0.1:3002/assistant",
    validate: async (response) => response.headers.get("content-type")?.includes("text/html") === true,
  },
  {
    name: "front -> api",
    url: "http://127.0.0.1:3002/api/backend/health",
    validate: async (response) => (await response.json()).status === "ok",
  },
  {
    name: "api -> Supabase",
    url: "http://127.0.0.1:3000/v1/agent/products",
    init: { headers: agentAuthorization },
    validate: async (response) => Array.isArray((await response.json()).products),
  },
  {
    name: "agent -> Supabase",
    url: "http://127.0.0.1:3001/v1/agent-runs?ownerId=00000000-0000-4000-8000-000000000001",
    init: { headers: agentAuthorization },
    validate: async (response) => Array.isArray((await response.json()).data?.runs),
  },
];

const deadline = Date.now() + 60_000;
let failures = [];

while (Date.now() < deadline) {
  const results = await Promise.all(checks.map(runCheck));
  failures = results.filter((result) => !result.ok);
  if (failures.length === 0) {
    console.log("Local stack is ready:");
    for (const check of checks) console.log(`  ${check.name}: ${check.url}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error("Local stack did not become ready within 60 seconds:");
for (const failure of failures) console.error(`  ${failure.name}: ${failure.reason}`);
process.exit(1);

async function runCheck(check) {
  try {
    const response = await fetch(check.url, {
      ...check.init,
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return { name: check.name, ok: false, reason: `HTTP ${response.status}` };
    if (!(await check.validate(response))) {
      return { name: check.name, ok: false, reason: "unexpected response" };
    }
    return { name: check.name, ok: true };
  } catch (error) {
    return {
      name: check.name,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
