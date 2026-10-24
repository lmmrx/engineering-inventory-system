-- Per-user display settings (theme, font, zoom, language).
ALTER TABLE "User" ADD COLUMN "preferences" JSONB;
