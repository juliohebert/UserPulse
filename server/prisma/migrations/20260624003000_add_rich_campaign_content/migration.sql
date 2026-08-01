ALTER TABLE "campanhas" ADD COLUMN "subtitulo" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "imagem_url" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "video_url" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "texto_botao" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "url_botao" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "feedback_habilitado" BOOLEAN NOT NULL DEFAULT true;
