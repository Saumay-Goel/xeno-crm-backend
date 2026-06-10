/*
  Warnings:

  - Added the required column `user_id` to the `campaigns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `segments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "campaigns_user_id_idx" ON "campaigns"("user_id");

-- CreateIndex
CREATE INDEX "segments_user_id_idx" ON "segments"("user_id");

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
