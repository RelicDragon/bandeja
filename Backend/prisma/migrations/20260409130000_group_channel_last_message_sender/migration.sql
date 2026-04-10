ALTER TABLE "GroupChannel" ADD COLUMN "lastMessageSenderId" TEXT;

ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_lastMessageSenderId_fkey" FOREIGN KEY ("lastMessageSenderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
