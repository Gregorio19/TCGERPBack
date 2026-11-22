-- CreateEnum
CREATE TYPE "StoreCreditRefType" AS ENUM ('order', 'return', 'purchase');

-- CreateEnum
CREATE TYPE "CustomerPurchasePaymentMethod" AS ENUM ('efectivo', 'credito_tienda', 'transferencia');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'devuelta_parcial';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "stock_minimo" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "credito_tienda" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_method" "PaymentMethod" NOT NULL,
    "refund_amount" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "cash_session_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_credit_movements" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_type" "StoreCreditRefType" NOT NULL,
    "ref_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_credit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_purchases" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "payment_method" "CustomerPurchasePaymentMethod" NOT NULL,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "cash_session_id" TEXT,
    "visit_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_purchase_items" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "condition" "Condition",

    CONSTRAINT "customer_purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "returns_order_id_created_at_idx" ON "returns"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_cash_session_id_idx" ON "returns"("cash_session_id");

-- CreateIndex
CREATE INDEX "returns_branch_id_created_at_idx" ON "returns"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_created_at_idx" ON "returns"("created_at");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_id_order_item_id_key" ON "return_items"("return_id", "order_item_id");

-- CreateIndex
CREATE INDEX "store_credit_movements_customer_id_created_at_idx" ON "store_credit_movements"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "store_credit_movements_ref_type_ref_id_idx" ON "store_credit_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_purchases_visit_id_key" ON "customer_purchases"("visit_id");

-- CreateIndex
CREATE INDEX "customer_purchases_customer_id_created_at_idx" ON "customer_purchases"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_purchases_cash_session_id_idx" ON "customer_purchases"("cash_session_id");

-- CreateIndex
CREATE INDEX "customer_purchase_items_purchase_id_idx" ON "customer_purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credit_movements" ADD CONSTRAINT "store_credit_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credit_movements" ADD CONSTRAINT "store_credit_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchases" ADD CONSTRAINT "customer_purchases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchases" ADD CONSTRAINT "customer_purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchases" ADD CONSTRAINT "customer_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchases" ADD CONSTRAINT "customer_purchases_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchases" ADD CONSTRAINT "customer_purchases_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "customer_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_items" ADD CONSTRAINT "customer_purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "customer_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_items" ADD CONSTRAINT "customer_purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

