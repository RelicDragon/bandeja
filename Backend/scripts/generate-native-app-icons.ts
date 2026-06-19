import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve(__dirname, '../../Frontend/public');
const IOS_PUBLIC = path.resolve(__dirname, '../../Frontend/ios/App/App/public');
const IOS_ASSETS = path.resolve(__dirname, '../../Frontend/ios/App/App/Assets.xcassets');
const ANDROID_DRAWABLE = path.resolve(
  __dirname,
  '../../Frontend/android/app/src/main/res/drawable',
);

type SportIconSpec = {
  slug: string;
  nativeName: string;
  sourceFile: string;
  splashSourceFile: string;
};

const SPORT_ICONS: SportIconSpec[] = [
  {
    slug: 'tennis',
    nativeName: 'tennis',
    sourceFile: 'bandeja2-tennis-blue-45-icon.png',
    splashSourceFile: 'bandeja2-tennis-white-tr.png',
  },
  {
    slug: 'pickleball',
    nativeName: 'pickleball',
    sourceFile: 'bandeja2-pickleball-blue-45-icon.png',
    splashSourceFile: 'bandeja2-pickleball-white-tr.png',
  },
  {
    slug: 'badminton',
    nativeName: 'badminton',
    sourceFile: 'bandeja2-badminton-blue-45-icon.png',
    splashSourceFile: 'bandeja2-badminton-white-tr.png',
  },
  {
    slug: 'table-tennis',
    nativeName: 'table_tennis',
    sourceFile: 'bandeja2-table-tennis-blue-45-icon.png',
    splashSourceFile: 'bandeja2-table-tennis-white-tr.png',
  },
  {
    slug: 'squash',
    nativeName: 'squash',
    sourceFile: 'bandeja2-squash-blue-45-icon.png',
    splashSourceFile: 'bandeja2-squash-white-tr.png',
  },
];

async function writeIosIcon(spec: SportIconSpec, png: Buffer): Promise<void> {
  const dir = path.join(IOS_ASSETS, `${spec.nativeName}.appiconset`);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${spec.nativeName}-1024.png`;
  await fs.writeFile(path.join(dir, filename), png);
  await fs.writeFile(
    path.join(dir, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          {
            filename,
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    ) + '\n',
  );
}

async function writeAndroidIcon(spec: SportIconSpec, png: Buffer): Promise<void> {
  await fs.mkdir(ANDROID_DRAWABLE, { recursive: true });
  await fs.writeFile(path.join(ANDROID_DRAWABLE, `ic_launcher_${spec.nativeName}.png`), png);
}

async function writeAndroidSplashLogo(nativeName: string, sourcePath: string): Promise<void> {
  const png = await sharp(sourcePath)
    .resize(1080, 675, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(ANDROID_DRAWABLE, `splash_logo_${nativeName}.png`), png);
  const splashXml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background"/>
    <item>
        <bitmap
            android:gravity="center"
            android:src="@drawable/splash_logo_${nativeName}"/>
    </item>
</layer-list>
`;
  await fs.writeFile(path.join(ANDROID_DRAWABLE, `splash_${nativeName}.xml`), splashXml);
}

async function copyToIosPublic(fileName: string): Promise<void> {
  await fs.mkdir(IOS_PUBLIC, { recursive: true });
  await fs.copyFile(path.join(PUBLIC_DIR, fileName), path.join(IOS_PUBLIC, fileName));
}

async function generateIcon(spec: SportIconSpec): Promise<void> {
  const sourcePath = path.join(PUBLIC_DIR, spec.sourceFile);
  const png = await sharp(sourcePath)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0xb3, g: 0xe1, b: 0xe6, alpha: 1 } })
    .png()
    .toBuffer();
  await writeIosIcon(spec, png);
  await writeAndroidIcon(spec, png);
  await writeAndroidSplashLogo(spec.nativeName, path.join(PUBLIC_DIR, spec.splashSourceFile));
  await copyToIosPublic(spec.splashSourceFile);
  console.log(`Generated native icons for ${spec.nativeName}`);
}

async function generateRacketSplash(): Promise<void> {
  const racketSource = path.join(PUBLIC_DIR, 'orig_icons/racket-blue/bandeja-blue-flat.png');
  await writeAndroidSplashLogo('racket', racketSource);
  await fs.mkdir(path.join(IOS_PUBLIC, 'orig_icons/racket-blue'), { recursive: true });
  await fs.copyFile(
    racketSource,
    path.join(IOS_PUBLIC, 'orig_icons/racket-blue/bandeja-blue-flat.png'),
  );
  console.log('Generated racket splash assets');
}

async function main(): Promise<void> {
  for (const spec of SPORT_ICONS) {
    await generateIcon(spec);
  }
  await generateRacketSplash();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
