BEGIN;

ALTER TABLE "returns" ADD COLUMN "idempotency_key" TEXT;

-- Give existing returns a unique key before enforcing the constraint.
UPDATE "returns" SET "idempotency_key" = 'legacy-return:' || "id";

ALTER TABLE "returns" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "returns_idempotency_key_key" ON "returns"("idempotency_key");

COMMIT;
