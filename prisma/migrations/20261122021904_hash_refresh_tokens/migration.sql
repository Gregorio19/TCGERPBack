BEGIN;

-- Invalidar los refresh tokens existentes antes de retirar la columna en texto plano.
LOCK TABLE "refresh_tokens" IN ACCESS EXCLUSIVE MODE;
DELETE FROM "refresh_tokens";

-- DropIndex
DROP INDEX "refresh_tokens_token_key";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "token",
ADD COLUMN     "token_hash" VARCHAR(64) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

COMMIT;
