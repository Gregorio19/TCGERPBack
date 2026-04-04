-- Branch: email + configuracion local (API admin)
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "configuracion" JSONB;

-- User: perfil admin
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telefono" VARCHAR(50);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" VARCHAR(500);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ultimo_acceso" TIMESTAMP(3);

-- Permission: categoría para catálogo front
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "categoria" VARCHAR(50) NOT NULL DEFAULT 'general';

-- Setting: tipo de valor
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "tipo" VARCHAR(50) NOT NULL DEFAULT 'string';
