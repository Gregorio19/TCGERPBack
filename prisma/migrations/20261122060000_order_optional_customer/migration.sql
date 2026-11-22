-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_cliente_id_fkey";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "cliente_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

