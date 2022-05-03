/*
  Warnings:

  - Added the required column `fromMe` to the `chats_whatsapp` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `chats_whatsapp` ADD COLUMN `fromMe` BOOLEAN NOT NULL;
