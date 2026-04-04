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
