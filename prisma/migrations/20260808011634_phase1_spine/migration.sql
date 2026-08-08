-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "senderCvi" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "recipientCvi" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "releasedAt" DATETIME,
    "txHash" TEXT,
    CONSTRAINT "Leg_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT,
    "legId" TEXT,
    "eventType" TEXT NOT NULL,
    "trigger" TEXT,
    "verdict" TEXT,
    "reasonCode" TEXT,
    "checkResults" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Intent_senderCvi_idx" ON "Intent"("senderCvi");

-- CreateIndex
CREATE INDEX "Intent_status_idx" ON "Intent"("status");

-- CreateIndex
CREATE INDEX "Leg_intentId_idx" ON "Leg"("intentId");

-- CreateIndex
CREATE INDEX "Leg_recipientCvi_idx" ON "Leg"("recipientCvi");

-- CreateIndex
CREATE INDEX "Leg_status_idx" ON "Leg"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_intentId_idx" ON "AuditEvent"("intentId");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
