/*
  Warnings:

  - You are about to drop the column `completed` on the `Todo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Todo" DROP COLUMN "completed",
ADD COLUMN     "completedAt" TIMESTAMP(3);
