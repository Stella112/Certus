ALTER TABLE "Intent" ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'monad';
CREATE INDEX "Intent_chain_idx" ON "Intent"("chain");
