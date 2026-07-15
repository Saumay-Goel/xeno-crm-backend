/*
  Warnings:

  - You are about to drop the column `segment_id` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `customer_id` on the `communications` table. All the data in the column will be lost.
  - You are about to drop the `customers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `orders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `segments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_segment_id_fkey";

-- DropForeignKey
ALTER TABLE "communications" DROP CONSTRAINT "communications_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "segments" DROP CONSTRAINT "segments_user_id_fkey";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "segment_id";

-- AlterTable
ALTER TABLE "communications" DROP COLUMN "customer_id";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "orders";

-- DropTable
DROP TABLE "segments";
