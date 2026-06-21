-- CreateTable
CREATE TABLE "customer_attachments" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "original_size_bytes" INTEGER NOT NULL,
    "stored_size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "descripcion" VARCHAR(500),
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_attachments_storage_key_key" ON "customer_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "customer_attachments_customer_id_created_at_idx" ON "customer_attachments"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
