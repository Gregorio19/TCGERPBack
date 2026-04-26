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
