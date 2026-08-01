-- AddColumn: encerrar_apos_evento and evento_conclusao to campanhas
ALTER TABLE "campanhas" ADD COLUMN "encerrar_apos_evento" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "campanhas" ADD COLUMN "evento_conclusao" TEXT;
