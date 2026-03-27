import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import sharp from 'sharp';
import { S3Service } from '../src/services/s3.service';
import { userAvatarTinyUrlFromStandard } from '../src/utils/userAvatarTiny';

async function tinyExists(tinyUrl: string): Promise<boolean> {
  try {
    const key = S3Service.extractS3Key(tinyUrl);
    return await S3Service.objectExists(key);
  } catch {
    try {
      const r = await fetch(tinyUrl, { method: 'HEAD' });
      return r.ok;
    } catch {
      return false;
    }
  }
}

async function backfill() {
  const users = await prisma.user.findMany({
    where: { avatar: { not: null } },
    select: { id: true, avatar: true },
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const u of users) {
    const avatar = u.avatar;
    if (!avatar) continue;
    const tinyUrl = userAvatarTinyUrlFromStandard(avatar);
    if (!tinyUrl) {
      skipped++;
      continue;
    }
    try {
      if (await tinyExists(tinyUrl)) {
        skipped++;
        continue;
      }
      const res = await fetch(avatar);
      if (!res.ok) {
        console.error(`Fetch avatar failed ${u.id}: HTTP ${res.status}`);
        errors++;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const tinyBuf = await sharp(buf)
        .resize(96, 96, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 82 })
        .toBuffer();
      const key = S3Service.extractS3Key(tinyUrl);
      await S3Service.uploadFile(tinyBuf, key, 'image/jpeg');
      created++;
      if (created % 100 === 0) console.log(`Uploaded ${created} tiny avatars…`);
    } catch (e) {
      console.error(`User ${u.id}:`, e);
      errors++;
    }
  }

  console.log(JSON.stringify({ created, skipped, errors, total: users.length }, null, 2));
}

backfill().finally(() => prisma.$disconnect());
