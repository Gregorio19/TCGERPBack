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
