-- CreateTable
CREATE TABLE "customer_visits" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_visits_customer_id_idx" ON "customer_visits"("customer_id");

-- CreateIndex
CREATE INDEX "customer_visits_fecha_idx" ON "customer_visits"("fecha");

-- CreateIndex
CREATE INDEX "customer_visits_usuario_id_idx" ON "customer_visits"("usuario_id");

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
