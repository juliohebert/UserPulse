ALTER TABLE "campanhas" ADD COLUMN "modo_exibicao" TEXT NOT NULL DEFAULT 'modal_automatica';
ALTER TABLE "campanhas" ADD COLUMN "gatilho" TEXT NOT NULL DEFAULT 'ao_abrir_tela';
ALTER TABLE "campanhas" ADD COLUMN "evento" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "atraso_ms" INTEGER NOT NULL DEFAULT 800;
ALTER TABLE "campanhas" ADD COLUMN "mostrar_uma_vez" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "campanhas" ADD COLUMN "prioridade" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "campanhas" ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;
