/**
 * Parameterized Fly.io deploy script.
 *
 * Usage:
 *   bun infra/deploy.ts <service>
 *   ENV=production bun infra/deploy.ts <service>
 *
 * Services: ledger, tb, tunnel
 * ENV defaults to "staging".
 */

const env = process.env.ENV ?? "staging";

/** Config directory for each deployable service. */
const services: Record<string, string> = {
  ledger: "services/ledger",
  tb: "infra/tigerbeetle",
  tunnel: "services/tunnel",
};

/** Fly app name: oklol-{service} in prod, oklol-{service}-{env} otherwise. */
function app(service: string) {
  return env === "production"
    ? `oklol-${service}`
    : `oklol-${service}-${env}`;
}

// –
// Main
// –

const service = process.argv[2];
const dir = service ? services[service] : undefined;

if (!service || !dir) {
  console.error(
    `Usage: bun infra/deploy.ts <${Object.keys(services).join("|")}>`
  );
  process.exit(1);
}

const name = app(service);
console.log(`Deploying ${name} from ${dir} …`);
await Bun.$`fly deploy --app ${name} ${dir}`;
