-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_segment_id_fkey";

-- DropForeignKey
ALTER TABLE "communications" DROP CONSTRAINT "communications_customer_id_fkey";

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audience_sql" TEXT,
ADD COLUMN     "contact_column" TEXT,
ADD COLUMN     "dataset_id" TEXT,
ALTER COLUMN "segment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "communications" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "dataset_row_id" TEXT,
ALTER COLUMN "customer_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
