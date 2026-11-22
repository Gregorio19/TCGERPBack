-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('venta', 'recepcion', 'transferencia_salida', 'transferencia_entrada', 'ajuste', 'devolucion', 'compra_cliente');

-- CreateEnum
CREATE TYPE "StockMovementRefType" AS ENUM ('order', 'reception', 'transfer', 'return', 'purchase');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('efectivo', 'debito', 'credito', 'transferencia', 'credito_tienda');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('abierta', 'cerrada');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "canal" VARCHAR(100),
ALTER COLUMN "apellido" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "telefono" DROP NOT NULL,
ALTER COLUMN "rut" DROP NOT NULL,
ALTER COLUMN "direccion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "vendedor_id" TEXT;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "branch_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT,
    "ref_type" "StockMovementRefType",
    "ref_id" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "cash_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_amount" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "counted_amount" INTEGER,
    "expected_amount" INTEGER,
    "difference" INTEGER,
    "notes" TEXT,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'abierta',

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_branch_id_created_at_idx" ON "stock_movements"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_type_created_at_idx" ON "stock_movements"("type", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_cash_session_id_method_idx" ON "payments"("cash_session_id", "method");

-- CreateIndex
CREATE INDEX "cash_sessions_branch_id_opened_at_idx" ON "cash_sessions"("branch_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_at_idx" ON "cash_sessions"("opened_at");

-- CreateIndex
CREATE INDEX "orders_vendedor_id_idx" ON "orders"("vendedor_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Enforce at most one open register per branch and cashier.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_branch_user"
ON "cash_sessions" ("branch_id", "user_id") WHERE "status" = 'abierta';
