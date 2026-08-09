-- Persist principal-signed agent mandates and their bounded limits.
CREATE TABLE "AgentMandate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "principalAddress" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'monad',
    "policyId" TEXT NOT NULL,
    "perTransactionLimit" TEXT NOT NULL,
    "dailyLimit" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "signature" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AgentMandate_principalAddress_idx" ON "AgentMandate"("principalAddress");
CREATE INDEX "AgentMandate_agentAddress_idx" ON "AgentMandate"("agentAddress");
CREATE INDEX "AgentMandate_status_idx" ON "AgentMandate"("status");
