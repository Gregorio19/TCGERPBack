ALTER TABLE "products" ADD COLUMN "ean" VARCHAR(20);

CREATE UNIQUE INDEX "products_ean_key" ON "products"("ean");
