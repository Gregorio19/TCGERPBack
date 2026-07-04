/**
 * Sincroniza incrementalmente el catálogo de permisos desde permissions-canonical.json.
 * No borra permisos ni enlaces existentes; los nuevos se asignan al rol Admin.
 *
 * Uso: npx tsx scripts/sync-permissions-catalog.mts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new PrismaClient();

type CatalogPermission = {
  nombre: string;
  recurso: string;
  accion: string;
  categoria: string;
  descripcion: string;
};

function loadCatalog(): CatalogPermission[] {
  const path = join(__dirname, '../api-spec/permissions-canonical.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
    permissions?: CatalogPermission[];
  };
  if (!Array.isArray(raw.permissions)) {
    throw new Error('permissions-canonical.json: falta array "permissions"');
  }
  return raw.permissions;
}

async function main() {
  const catalog = loadCatalog();
  console.log(`🔐 Sincronizando ${catalog.length} permisos canónicos...`);

  let created = 0;
  let updated = 0;
  const newPermissionIds: string[] = [];

  for (const p of catalog) {
    const existing = await db.permission.findUnique({ where: { nombre: p.nombre } });

    if (existing) {
      const needsUpdate =
        existing.recurso !== p.recurso ||
        existing.accion !== p.accion ||
        existing.categoria !== p.categoria ||
        (existing.descripcion ?? '') !== p.descripcion;

      if (needsUpdate) {
        await db.permission.update({
          where: { id: existing.id },
          data: {
            recurso: p.recurso,
            accion: p.accion,
            categoria: p.categoria,
            descripcion: p.descripcion,
          },
        });
        updated++;
        console.log(`   ↻ actualizado: ${p.nombre}`);
      }
    } else {
      const row = await db.permission.create({
        data: {
          nombre: p.nombre,
          recurso: p.recurso,
          accion: p.accion,
          categoria: p.categoria,
          descripcion: p.descripcion,
        },
      });
      created++;
      newPermissionIds.push(row.id);
      console.log(`   + creado: ${p.nombre}`);
    }
  }

  if (newPermissionIds.length > 0) {
    const adminRole = await db.role.findFirst({
      where: { nombre: 'Admin', deletedAt: null },
    });

    if (!adminRole) {
      console.log('   ⚠ Sin rol Admin: permisos nuevos sin enlazar.');
    } else {
      const links = await db.rolePermission.createMany({
        data: newPermissionIds.map((permissionId) => ({
          roleId: adminRole.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
      console.log(`   → ${links.count} enlace(s) nuevo(s) al rol Admin`);
    }
  }

  const total = await db.permission.count();
  console.log(`\n✅ Listo: ${created} creados, ${updated} actualizados, ${total} permisos en BD.`);
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
