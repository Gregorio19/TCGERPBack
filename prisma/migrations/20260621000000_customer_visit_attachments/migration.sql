-- CreateTable
CREATE TABLE "customer_visit_attachments" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "original_size_bytes" INTEGER NOT NULL,
    "stored_size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "descripcion" VARCHAR(500),
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_visit_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_visit_attachments_storage_key_key" ON "customer_visit_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "customer_visit_attachments_visit_id_created_at_idx" ON "customer_visit_attachments"("visit_id", "created_at");

-- AddForeignKey
ALTER TABLE "customer_visit_attachments" ADD CONSTRAINT "customer_visit_attachments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "customer_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_attachments" ADD CONSTRAINT "customer_visit_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
