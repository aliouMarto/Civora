/**
 * Seed photos de démo pour les biens existants.
 * - 3 photos par bien, depuis Unsplash, choisies selon le type (villa / appartement / etc.)
 * - Idempotent : ne touche pas aux biens qui ont déjà des photos.
 * Usage:
 *   pnpm exec ts-node --transpile-only --project tsconfig.json prisma/seeds/biens-photos.seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Pools Unsplash par type. URLs directes (paramètres w=1200 pour performance).
const PHOTOS_BY_TYPE: Record<string, string[]> = {
  villa: [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80',
  ],
  appartement: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80',
    'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1200&q=80',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=80',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=80',
    'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1200&q=80',
  ],
  studio: [
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&q=80',
    'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=80',
    'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1200&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80',
  ],
  bureau: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80',
    'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=1200&q=80',
    'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=1200&q=80',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&q=80',
  ],
  local_commercial: [
    'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=1200&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80',
    'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=1200&q=80',
    'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?w=1200&q=80',
  ],
  terrain: [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80',
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=80',
  ],
  immeuble: [
    'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=80',
    'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=1200&q=80',
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80',
    'https://images.unsplash.com/photo-1554435493-93422e8220c8?w=1200&q=80',
    'https://images.unsplash.com/photo-1531971589569-0d9370cbe1e5?w=1200&q=80',
  ],
  autre: [
    'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=1200&q=80',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80',
  ],
};

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function main(): Promise<void> {
  console.log('🖼️   Seeding photos de biens (Unsplash)...');

  const biens = await prisma.bien.findMany({
    select: { id: true, agence_id: true, type: true, nom: true, _count: { select: { photos: true } } },
  });

  let createdTotal = 0;
  let skipped = 0;

  for (const b of biens) {
    if (b._count.photos > 0) {
      skipped++;
      continue;
    }
    const pool = PHOTOS_BY_TYPE[String(b.type).toLowerCase()] ?? PHOTOS_BY_TYPE.appartement!;
    const picks = shuffle(pool).slice(0, 3);

    await prisma.bienPhoto.createMany({
      data: picks.map((url, idx) => ({
        agence_id: b.agence_id,
        bien_id: b.id,
        storage_key: url,
        caption: idx === 0 ? 'Photo principale' : null,
        ordre: idx,
      })),
    });
    createdTotal += picks.length;
    console.log(`  ✓ ${b.nom}: ${picks.length} photos`);
  }

  console.log(`\n✅  Photos créées: ${createdTotal} sur ${biens.length - skipped} biens. (${skipped} déjà équipés)`);
}

main()
  .catch((e) => {
    console.error('❌  Seed photos échoué:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
