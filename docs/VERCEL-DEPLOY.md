# Deploy Certus to Vercel

Certus is a Next.js application with server routes and Prisma. Local development uses SQLite, but Vercel must use PostgreSQL because serverless filesystems are not durable. The repository includes `prisma/schema.postgres.prisma` and a Vercel-specific build command.

## Fastest deployment path

### 1. Push the repository

Push the current branch to GitHub. Confirm that `.env` and every private key remain untracked.

### 2. Import the project

1. Open <https://vercel.com/new>.
2. Import `Stella112/Certus`.
3. Leave **Root Directory** as `.`.
4. Framework should be detected as **Next.js**.
5. `vercel.json` sets the build command to `npm run vercel-build`.

### 3. Attach PostgreSQL

In the Vercel project, open **Storage** or **Integrations**, create a Neon Postgres database, and connect it to Certus. Confirm that Vercel created a `DATABASE_URL` environment variable for Production, Preview, and Development.

The build command runs:

```text
prisma generate --schema=prisma/schema.postgres.prisma
prisma db push --schema=prisma/schema.postgres.prisma
next build
```

Do not use `file:./dev.db` on Vercel.

### 4. Add server-only environment variables

Copy the real values from the local `.env` into **Project Settings → Environment Variables**:

```text
CLEANVERSE_BASE_URL
CLEANVERSE_API_ID
CLEANVERSE_API_KEY

DEFAULT_CHAIN=monad
MONAD_CHAIN_ID=10143
MONAD_RPC_URL
MONAD_EXPLORER_URL

DEPLOYER_PRIVATE_KEY
CERTUS_OPERATOR_TOKEN

CERTUS_AGENT_PROVIDER
CERTUS_AGENT_PRIVATE_KEY
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
```

If the OpenAI runtime is used instead of Claude, set `OPENAI_API_KEY` and `CERTUS_AGENT_MODEL` and change `CERTUS_AGENT_PROVIDER=openai`.

Security rules:

- Use only the existing throwaway Monad testnet deployer key.
- Never use a wallet holding mainnet funds.
- Keep every key server-side; do not prefix it with `NEXT_PUBLIC_`.
- Generate `CERTUS_OPERATOR_TOKEN` as a long random secret.

### 5. Deploy

Select **Deploy**. Vercel will install dependencies, generate the PostgreSQL Prisma client, create the schema, and build Next.js.

After deployment, verify:

```text
/
/dashboard
/dashboard/send
/dashboard/agents
/dashboard/batches
/dashboard/yield
/dashboard/audit
```

Then connect the funded Monad testnet wallet and run a `0.10 USDC` payment preflight.

## CLI alternative

After installing and authenticating the Vercel CLI:

```powershell
npx vercel login
npx vercel link
npx vercel env pull .env.vercel.local
npx vercel --prod
```

The dashboard route is safer for the first deployment because it makes the Neon database and environment variables easier to verify.

## Common failures

### Prisma says the database URL is invalid

The Vercel `DATABASE_URL` must start with `postgresql://` or `postgres://`. A local `file:` URL cannot be used with the production schema.

### Dashboard loads but mutations return 401

Set `CERTUS_OPERATOR_TOKEN`. Operator-only routes require it in production.

### Agent page says the runtime is not configured

Set the selected provider's API key and model. For the current Claude configuration, set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

### Cleanverse checks fail in production

Confirm all three Cleanverse variables were added to the Production environment and redeploy. Certus intentionally fails closed when Cleanverse is unavailable.

### The database is empty

An empty database is valid and the interactive forms still work. For the submission video, use the local seeded dashboard or create a small live intent after deployment. Do not run the destructive local reset script against the production database.
