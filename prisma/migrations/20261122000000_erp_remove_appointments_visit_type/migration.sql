-- CreateEnum
CREATE TYPE "CustomerVisitType" AS ENUM ('compra', 'venta_a_tienda', 'tasacion', 'consignacion', 'torneo_evento', 'consulta', 'otro');

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_service_type_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "appointment_holds" DROP CONSTRAINT "appointment_holds_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "appointment_holds" DROP CONSTRAINT "appointment_holds_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "appointment_overbooking_policies" DROP CONSTRAINT "appointment_overbooking_policies_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "appointment_overbooking_policies" DROP CONSTRAINT "appointment_overbooking_policies_service_type_id_fkey";

-- AlterTable
ALTER TABLE "customer_visits" ADD COLUMN     "tipo" "CustomerVisitType" NOT NULL DEFAULT 'otro';

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "monto_cita_bruta",
DROP COLUMN "monto_cita_total";

-- DropTable
DROP TABLE "appointment_service_types";

-- DropTable
DROP TABLE "appointments";

-- DropTable
DROP TABLE "appointment_holds";

-- DropTable
DROP TABLE "appointment_overbooking_policies";

-- DropEnum
DROP TYPE "AppointmentStatus";

-- DropEnum
DROP TYPE "AppointmentSource";

