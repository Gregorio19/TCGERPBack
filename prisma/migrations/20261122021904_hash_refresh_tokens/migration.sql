BEGIN;

-- AlterTable
ALTER TABLE "refresh_tokens"
    ALTER COLUMN "token" DROP NOT NULL,
    ADD COLUMN "token_hash" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

COMMIT;
