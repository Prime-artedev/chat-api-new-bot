-- CreateTable
CREATE TABLE `chats_whatsapp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jid` VARCHAR(30) NOT NULL,
    `messageId` VARCHAR(100) NOT NULL,
    `pushName` VARCHAR(100) NOT NULL,
    `message` TEXT NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `instance` VARCHAR(250) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
