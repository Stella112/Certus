CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "recipientCvi" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "nextEpochAt" DATETIME NOT NULL,
    "nextLegSequence" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastProcessedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Subscription_intentId_key" ON "Subscription"("intentId");
CREATE INDEX "Subscription_status_nextEpochAt_idx" ON "Subscription"("status", "nextEpochAt");
CREATE INDEX "Subscription_recipientCvi_idx" ON "Subscription"("recipientCvi");

CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "recipientCvi" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentLink_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentLink_slug_key" ON "PaymentLink"("slug");
CREATE UNIQUE INDEX "PaymentLink_intentId_key" ON "PaymentLink"("intentId");
CREATE INDEX "PaymentLink_status_idx" ON "PaymentLink"("status");
