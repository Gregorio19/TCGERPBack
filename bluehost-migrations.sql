-- Ejecutar en phpPgAdmin → BD pandigee_tcgerp
-- Antes: CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- === 20251124001216_init ===
-- CreateEnum
CREATE TYPE "Game" AS ENUM ('pokemon', 'yugioh', 'magic', 'digimon', 'one_piece', 'dragon_ball', 'naruto', 'bleach', 'final_fantasy', 'card_fight_vanguard', 'weiss_schwarz', 'battle_spirits', 'other');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('comun', 'infrecuente', 'rara', 'rara_holo', 'rara_secreta', 'rara_ultra', 'rara_gold', 'rara_rainbow', 'rara_alternate', 'rara_full_art', 'rara_charizard', 'legendary', 'mythic');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('mint', 'near_mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'damaged');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('espanol', 'ingles', 'japones', 'chino', 'koreano', 'frances', 'aleman', 'italiano', 'portugues', 'ruso');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('single', 'sellado', 'bundle', 'collection');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pendiente', 'confirmada', 'en_proceso', 'enviada', 'entregada', 'completada', 'cancelada', 'reembolsada', 'devuelta');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('tienda_fisica', 'online', 'telefono', 'whatsapp', 'redes_sociales', 'marketplace', 'mayorista', 'evento', 'other');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('boleta', 'factura', 'nota_credito', 'nota_debito', 'guia_despacho', 'recibo');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('activo', 'inactivo', 'suspendido');

-- CreateEnum
CREATE TYPE "ReceptionStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDIENTE', 'EN_TRANSITO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'costo');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('manual', 'automatico', 'ajuste', 'cierre');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('borrador', 'aprobado', 'contabilizado', 'anulado');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('activo', 'inactivo', 'suspendido', 'licencia');

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(1000),
    "sku" VARCHAR(50),
    "juego" "Game",
    "set" TEXT,
    "nro_coleccionista" VARCHAR(50),
    "rareza" "Rarity",
    "idioma" "Language",
    "condicion" "Condition",
    "tipo" "ProductType",
    "precio" INTEGER NOT NULL,
    "precio_compra" INTEGER,
    "iva" INTEGER NOT NULL DEFAULT 19,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "categoria" TEXT NOT NULL,
    "imagen" TEXT,
    "imagenes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_by_branch" (
    "id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_by_branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "direccion" VARCHAR(500) NOT NULL,
    "telefono" VARCHAR(50),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telefono" VARCHAR(50) NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "direccion" JSONB NOT NULL,
    "estado" "CustomerStatus" NOT NULL DEFAULT 'activo',
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "estado" "OrderStatus" NOT NULL DEFAULT 'pendiente',
    "canal" "OrderChannel" NOT NULL,
    "tipo_documento" "DocType" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "descuento_general" INTEGER NOT NULL DEFAULT 0,
    "subtotal_con_descuento" INTEGER NOT NULL,
    "monto_iva" INTEGER NOT NULL,
    "costo_envio" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "telefono" VARCHAR(50),
    "direccion" VARCHAR(500),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receptions" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "fecha_recepcion" TIMESTAMP(3) NOT NULL,
    "fecha_documento" TIMESTAMP(3) NOT NULL,
    "numero_documento" VARCHAR(50) NOT NULL,
    "tipo_documento" TEXT NOT NULL,
    "estado" "ReceptionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_items" (
    "id" TEXT NOT NULL,
    "reception_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "sucursal_origen_id" TEXT NOT NULL,
    "sucursal_destino_id" TEXT NOT NULL,
    "fecha_transferencia" TIMESTAMP(3) NOT NULL,
    "estado" "TransferStatus" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "tipo" "AccountType" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "padre_id" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_entries" (
    "id" TEXT NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "EntryType" NOT NULL,
    "estado" "EntryStatus" NOT NULL DEFAULT 'borrador',
    "total_debe" INTEGER NOT NULL,
    "total_haber" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_movements" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "debe" INTEGER NOT NULL DEFAULT 0,
    "haber" INTEGER NOT NULL DEFAULT 0,
    "descripcion" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido_paterno" VARCHAR(100) NOT NULL,
    "apellido_materno" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "fecha_nacimiento" TIMESTAMP(3) NOT NULL,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL,
    "estado" "EmployeeStatus" NOT NULL DEFAULT 'activo',
    "branch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_termino" TIMESTAMP(3),
    "sueldo_base" INTEGER NOT NULL,
    "estado" VARCHAR(50) NOT NULL DEFAULT 'vigente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "sueldo_base" INTEGER NOT NULL,
    "bonos" INTEGER NOT NULL DEFAULT 0,
    "descuentos" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "estado" VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    "fecha_pago" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "monto" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sucursal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "recurso" VARCHAR(50) NOT NULL,
    "accion" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "clave" VARCHAR(100) NOT NULL,
    "valor" TEXT NOT NULL,
    "categoria" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(500),
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_categoria_idx" ON "products"("categoria");

-- CreateIndex
CREATE INDEX "products_juego_idx" ON "products"("juego");

-- CreateIndex
CREATE INDEX "products_activo_idx" ON "products"("activo");

-- CreateIndex
CREATE INDEX "stock_by_branch_branch_id_idx" ON "stock_by_branch"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_by_branch_product_id_branch_id_key" ON "stock_by_branch"("product_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_codigo_key" ON "branches"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_rut_key" ON "customers"("rut");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_rut_idx" ON "customers"("rut");

-- CreateIndex
CREATE INDEX "customers_estado_idx" ON "customers"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "orders_numero_key" ON "orders"("numero");

-- CreateIndex
CREATE INDEX "orders_cliente_id_idx" ON "orders"("cliente_id");

-- CreateIndex
CREATE INDEX "orders_sucursal_id_idx" ON "orders"("sucursal_id");

-- CreateIndex
CREATE INDEX "orders_estado_idx" ON "orders"("estado");

-- CreateIndex
CREATE INDEX "orders_fecha_creacion_idx" ON "orders"("fecha_creacion");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_rut_key" ON "suppliers"("rut");

-- CreateIndex
CREATE INDEX "suppliers_rut_idx" ON "suppliers"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "receptions_numero_key" ON "receptions"("numero");

-- CreateIndex
CREATE INDEX "receptions_proveedor_id_idx" ON "receptions"("proveedor_id");

-- CreateIndex
CREATE INDEX "receptions_sucursal_id_idx" ON "receptions"("sucursal_id");

-- CreateIndex
CREATE INDEX "receptions_estado_idx" ON "receptions"("estado");

-- CreateIndex
CREATE INDEX "reception_items_reception_id_idx" ON "reception_items"("reception_id");

-- CreateIndex
CREATE INDEX "reception_items_product_id_idx" ON "reception_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_numero_key" ON "transfers"("numero");

-- CreateIndex
CREATE INDEX "transfers_sucursal_origen_id_idx" ON "transfers"("sucursal_origen_id");

-- CreateIndex
CREATE INDEX "transfers_sucursal_destino_id_idx" ON "transfers"("sucursal_destino_id");

-- CreateIndex
CREATE INDEX "transfers_estado_idx" ON "transfers"("estado");

-- CreateIndex
CREATE INDEX "transfer_items_transfer_id_idx" ON "transfer_items"("transfer_id");

-- CreateIndex
CREATE INDEX "transfer_items_product_id_idx" ON "transfer_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_codigo_key" ON "accounts"("codigo");

-- CreateIndex
CREATE INDEX "accounts_codigo_idx" ON "accounts"("codigo");

-- CreateIndex
CREATE INDEX "accounts_tipo_idx" ON "accounts"("tipo");

-- CreateIndex
CREATE INDEX "accounts_padre_id_idx" ON "accounts"("padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_entries_numero_key" ON "accounting_entries"("numero");

-- CreateIndex
CREATE INDEX "accounting_entries_fecha_idx" ON "accounting_entries"("fecha");

-- CreateIndex
CREATE INDEX "accounting_entries_estado_idx" ON "accounting_entries"("estado");

-- CreateIndex
CREATE INDEX "entry_movements_entry_id_idx" ON "entry_movements"("entry_id");

-- CreateIndex
CREATE INDEX "entry_movements_account_id_idx" ON "entry_movements"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_rut_key" ON "employees"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_rut_idx" ON "employees"("rut");

-- CreateIndex
CREATE INDEX "employees_email_idx" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_estado_idx" ON "employees"("estado");

-- CreateIndex
CREATE INDEX "contracts_employee_id_idx" ON "contracts"("employee_id");

-- CreateIndex
CREATE INDEX "contracts_estado_idx" ON "contracts"("estado");

-- CreateIndex
CREATE INDEX "payrolls_employee_id_idx" ON "payrolls"("employee_id");

-- CreateIndex
CREATE INDEX "payrolls_periodo_idx" ON "payrolls"("periodo");

-- CreateIndex
CREATE INDEX "payrolls_estado_idx" ON "payrolls"("estado");

-- CreateIndex
CREATE INDEX "contributions_employee_id_idx" ON "contributions"("employee_id");

-- CreateIndex
CREATE INDEX "contributions_periodo_idx" ON "contributions"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_sucursal_id_idx" ON "users"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE INDEX "roles_nombre_idx" ON "roles"("nombre");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_nombre_key" ON "permissions"("nombre");

-- CreateIndex
CREATE INDEX "permissions_recurso_accion_idx" ON "permissions"("recurso", "accion");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_clave_key" ON "settings"("clave");

-- CreateIndex
CREATE INDEX "settings_categoria_idx" ON "settings"("categoria");

-- AddForeignKey
ALTER TABLE "stock_by_branch" ADD CONSTRAINT "stock_by_branch_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_branch" ADD CONSTRAINT "stock_by_branch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "receptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_items" ADD CONSTRAINT "reception_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_movements" ADD CONSTRAINT "entry_movements_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "accounting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_movements" ADD CONSTRAINT "entry_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === 20260126004204_add_contacto_to_supplier ===
-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "contacto" VARCHAR(200);

-- === 20260216022901_add_order_status_voucher_impreso ===
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'voucher_impreso';

-- === 20260323210500_hr_rrhh_full ===
-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('vigente', 'respaldo', 'terminado', 'suspendido');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('pendiente', 'procesada', 'pagada', 'cancelada');

-- DropForeignKey
ALTER TABLE "contributions" DROP CONSTRAINT "contributions_employee_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "payrolls_employee_id_idx";

-- AlterTable contracts: migrate estado string -> enum
ALTER TABLE "contracts" ADD COLUMN "jornada" VARCHAR(50);
ALTER TABLE "contracts" ADD COLUMN "numero_contrato" VARCHAR(50);
ALTER TABLE "contracts" ADD COLUMN "observaciones" TEXT;
ALTER TABLE "contracts" ADD COLUMN "estado_new" "ContractStatus";
UPDATE "contracts" SET "estado_new" = CASE
  WHEN lower(trim("estado")) = 'vigente' THEN 'vigente'::"ContractStatus"
  WHEN lower(trim("estado")) = 'respaldo' THEN 'respaldo'::"ContractStatus"
  WHEN lower(trim("estado")) = 'terminado' THEN 'terminado'::"ContractStatus"
  WHEN lower(trim("estado")) = 'suspendido' THEN 'suspendido'::"ContractStatus"
  ELSE 'vigente'::"ContractStatus"
END;
ALTER TABLE "contracts" DROP COLUMN "estado";
ALTER TABLE "contracts" RENAME COLUMN "estado_new" TO "estado";
ALTER TABLE "contracts" ALTER COLUMN "estado" SET NOT NULL;
ALTER TABLE "contracts" ALTER COLUMN "estado" SET DEFAULT 'vigente'::"ContractStatus";

-- AlterTable employees
ALTER TABLE "employees" ADD COLUMN "direccion" JSONB;
ALTER TABLE "employees" ADD COLUMN "position_id" TEXT;
ALTER TABLE "employees" ADD COLUMN "telefono" VARCHAR(50);

-- AlterTable payrolls (preserve data: liquido from total)
ALTER TABLE "payrolls" ADD COLUMN "contract_id" TEXT;
ALTER TABLE "payrolls" ADD COLUMN "fecha_generacion" DATE;
ALTER TABLE "payrolls" ADD COLUMN "liquido" INTEGER;
ALTER TABLE "payrolls" ADD COLUMN "observaciones" TEXT;
ALTER TABLE "payrolls" ADD COLUMN "total_descuentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "total_haberes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "total_imposiciones" INTEGER NOT NULL DEFAULT 0;
UPDATE "payrolls" SET "liquido" = COALESCE("total", "sueldo_base", 0) WHERE "liquido" IS NULL;
ALTER TABLE "payrolls" ALTER COLUMN "liquido" SET NOT NULL;
ALTER TABLE "payrolls" DROP COLUMN "bonos";
ALTER TABLE "payrolls" DROP COLUMN "descuentos";
ALTER TABLE "payrolls" DROP COLUMN "total";
ALTER TABLE "payrolls" ADD COLUMN "estado_new" "PayrollStatus";
UPDATE "payrolls" SET "estado_new" = CASE
  WHEN lower(trim(COALESCE("estado"::text, 'pendiente'))) = 'pendiente' THEN 'pendiente'::"PayrollStatus"
  WHEN lower(trim("estado"::text)) = 'procesada' THEN 'procesada'::"PayrollStatus"
  WHEN lower(trim("estado"::text)) = 'pagada' THEN 'pagada'::"PayrollStatus"
  WHEN lower(trim("estado"::text)) = 'cancelada' THEN 'cancelada'::"PayrollStatus"
  ELSE 'pendiente'::"PayrollStatus"
END;
ALTER TABLE "payrolls" DROP COLUMN "estado";
ALTER TABLE "payrolls" RENAME COLUMN "estado_new" TO "estado";
ALTER TABLE "payrolls" ALTER COLUMN "estado" SET NOT NULL;
ALTER TABLE "payrolls" ALTER COLUMN "estado" SET DEFAULT 'pendiente'::"PayrollStatus";
ALTER TABLE "payrolls" ALTER COLUMN "fecha_pago" SET DATA TYPE DATE;

-- DropTable
DROP TABLE "contributions";

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(500),
    "departamento" VARCHAR(120) NOT NULL,
    "nivel_jerarquico" INTEGER NOT NULL,
    "sueldo_minimo" INTEGER NOT NULL,
    "sueldo_maximo" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_data" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "banco" VARCHAR(120) NOT NULL,
    "tipo_cuenta" VARCHAR(50) NOT NULL,
    "numero_cuenta" VARCHAR(50) NOT NULL,
    "rut_titular" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_bank_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_social_security" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "afp" VARCHAR(50) NOT NULL,
    "salud" VARCHAR(50) NOT NULL,
    "isapre" VARCHAR(120),
    "mutual" BOOLEAN NOT NULL DEFAULT false,
    "afc" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje_afc" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_social_security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_earnings" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "tipo" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "monto" INTEGER NOT NULL,
    "es_imponible" BOOLEAN NOT NULL,
    "es_tributable" BOOLEAN NOT NULL,

    CONSTRAINT "payroll_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_deductions" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "tipo" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "monto" INTEGER NOT NULL,
    "es_legal" BOOLEAN NOT NULL,
    "es_voluntario" BOOLEAN NOT NULL,

    CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_imposition_lines" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "tipo" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "base_imponible" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "es_obligatoria" BOOLEAN NOT NULL,

    CONSTRAINT "payroll_imposition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contribution_summaries" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "fecha_generacion" DATE NOT NULL,
    "total_imposiciones" INTEGER NOT NULL,
    "afp" JSONB NOT NULL,
    "salud" JSONB NOT NULL,
    "afc" JSONB NOT NULL,
    "mutual" JSONB NOT NULL,

    CONSTRAINT "employee_contribution_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_calculation_parameters" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "porcentaje_afp" DOUBLE PRECISION NOT NULL,
    "porcentaje_salud" DOUBLE PRECISION NOT NULL,
    "porcentaje_afc" DOUBLE PRECISION NOT NULL,
    "porcentaje_mutual" DOUBLE PRECISION NOT NULL,
    "tramo_impuesto" VARCHAR(50) NOT NULL,
    "porcentaje_impuesto" DOUBLE PRECISION NOT NULL,
    "rebaja_impuesto" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_calculation_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_departamento_idx" ON "positions"("departamento");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bank_data_employee_id_key" ON "employee_bank_data"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_social_security_employee_id_key" ON "employee_social_security"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_earnings_payroll_id_idx" ON "payroll_earnings"("payroll_id");

-- CreateIndex
CREATE INDEX "payroll_deductions_payroll_id_idx" ON "payroll_deductions"("payroll_id");

-- CreateIndex
CREATE INDEX "payroll_imposition_lines_payroll_id_idx" ON "payroll_imposition_lines"("payroll_id");

-- CreateIndex
CREATE INDEX "employee_contribution_summaries_periodo_idx" ON "employee_contribution_summaries"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "employee_contribution_summaries_employee_id_periodo_key" ON "employee_contribution_summaries"("employee_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_numero_contrato_key" ON "contracts"("numero_contrato");

-- CreateIndex
CREATE INDEX "contracts_estado_idx" ON "contracts"("estado");

-- CreateIndex
CREATE INDEX "employees_position_id_idx" ON "employees"("position_id");

-- CreateIndex
CREATE INDEX "payrolls_estado_idx" ON "payrolls"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_employee_id_periodo_key" ON "payrolls"("employee_id", "periodo");

-- CreateIndex
CREATE INDEX "payrolls_employee_id_idx" ON "payrolls"("employee_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_data" ADD CONSTRAINT "employee_bank_data_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_social_security" ADD CONSTRAINT "employee_social_security_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_earnings" ADD CONSTRAINT "payroll_earnings_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_imposition_lines" ADD CONSTRAINT "payroll_imposition_lines_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contribution_summaries" ADD CONSTRAINT "employee_contribution_summaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A lo sumo un contrato vigente por empleado (PostgreSQL partial unique index)
CREATE UNIQUE INDEX "contracts_one_vigente_per_employee" ON "contracts" ("employee_id") WHERE "estado" = 'vigente';

-- === 20260403180000_admin_api_contract ===
-- Branch: email + configuracion local (API admin)
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "configuracion" JSONB;

-- User: perfil admin
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telefono" VARCHAR(50);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" VARCHAR(500);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ultimo_acceso" TIMESTAMP(3);

-- Permission: categoría para catálogo front
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "categoria" VARCHAR(50) NOT NULL DEFAULT 'general';

-- Setting: tipo de valor
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "tipo" VARCHAR(50) NOT NULL DEFAULT 'string';

-- === 20260405143924_refresh_tokens_and_generated_reports ===
-- DropIndex
DROP INDEX "payrolls_employee_id_idx";

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" TEXT NOT NULL,
    "tipo" VARCHAR(80) NOT NULL,
    "titulo" VARCHAR(300),
    "estado" VARCHAR(40) NOT NULL DEFAULT 'completado',
    "parametros" JSONB,
    "resultado" TEXT,
    "formato" VARCHAR(20),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "generated_reports_tipo_idx" ON "generated_reports"("tipo");

-- CreateIndex
CREATE INDEX "generated_reports_created_at_idx" ON "generated_reports"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === 20260405170658_customer_visits ===
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

-- === 20260425192124_employee_schedules ===
-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('override', 'off');

-- CreateTable
CREATE TABLE "employee_schedule_templates" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScheduleExceptionType" NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_schedule_templates_employee_id_idx" ON "employee_schedule_templates"("employee_id");

-- CreateIndex
CREATE INDEX "employee_schedule_templates_employee_id_day_of_week_is_acti_idx" ON "employee_schedule_templates"("employee_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "employee_schedule_templates_effective_from_effective_to_idx" ON "employee_schedule_templates"("effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "employee_schedule_exceptions_employee_id_date_idx" ON "employee_schedule_exceptions"("employee_id", "date");

-- CreateIndex
CREATE INDEX "employee_schedule_exceptions_employee_id_type_date_idx" ON "employee_schedule_exceptions"("employee_id", "type", "date");

-- AddForeignKey
ALTER TABLE "employee_schedule_templates" ADD CONSTRAINT "employee_schedule_templates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_exceptions" ADD CONSTRAINT "employee_schedule_exceptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === 20260426012300_appointments_agenda ===
-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('tentative', 'confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('manual', 'web', 'phone', 'whatsapp');

-- CreateTable
CREATE TABLE "appointment_service_types" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "duration_options" JSONB NOT NULL,
    "buffer_before_min" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_min" INTEGER NOT NULL DEFAULT 0,
    "allow_overbooking" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "service_type_id" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',
    "consumes_capacity" BOOLEAN NOT NULL DEFAULT true,
    "source" "AppointmentSource" NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "idempotency_key" VARCHAR(120),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_holds" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_overbooking_policies" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "service_type_id" TEXT,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "day_of_week" SMALLINT,
    "max_parallel" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_overbooking_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_service_types_is_active_idx" ON "appointment_service_types"("is_active");

-- CreateIndex
CREATE INDEX "appointments_customer_id_start_at_idx" ON "appointments"("customer_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_employee_id_start_at_idx" ON "appointments"("employee_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_status_start_at_idx" ON "appointments"("status", "start_at");

-- CreateIndex
CREATE INDEX "appointments_service_type_id_idx" ON "appointments"("service_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_idempotency_key_key" ON "appointments"("idempotency_key");

-- CreateIndex
CREATE INDEX "appointment_holds_employee_id_start_at_idx" ON "appointment_holds"("employee_id", "start_at");

-- CreateIndex
CREATE INDEX "appointment_holds_expires_at_idx" ON "appointment_holds"("expires_at");

-- CreateIndex
CREATE INDEX "appointment_overbooking_policies_employee_id_is_active_idx" ON "appointment_overbooking_policies"("employee_id", "is_active");

-- CreateIndex
CREATE INDEX "appointment_overbooking_policies_service_type_id_is_active_idx" ON "appointment_overbooking_policies"("service_type_id", "is_active");

-- CreateIndex
CREATE INDEX "appointment_overbooking_policies_effective_from_effective_to_idx" ON "appointment_overbooking_policies"("effective_from", "effective_to");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "appointment_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_overbooking_policies" ADD CONSTRAINT "appointment_overbooking_policies_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_overbooking_policies" ADD CONSTRAINT "appointment_overbooking_policies_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "appointment_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extension required for EXCLUDE USING gist with equality operator on text
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Integrity checks for appointments
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_end_gt_start_chk" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "appointments_duration_15m_chk" CHECK (("duration_min" % 15) = 0);

-- Integrity checks for holds
ALTER TABLE "appointment_holds"
  ADD CONSTRAINT "appointment_holds_end_gt_start_chk" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "appointment_holds_expires_before_end_chk" CHECK ("expires_at" <= "end_at");

-- Strong anti-overlap guard for active appointments per employee
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_employee_timeslot_excl"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('tentative', 'confirmed') AND "consumes_capacity" = true);
