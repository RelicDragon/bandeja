import prisma from './src/config/database';
import { hashPassword } from './src/utils/hash';
import { AuthProvider } from '@prisma/client';
import { ImageProcessor } from './src/utils/imageProcessor';

const numberOfUsersToInsert = 40;

const firstNames = [
  'Alejandro', 'Sofia', 'Carlos', 'Maria', 'Diego', 'Isabella', 'Miguel', 'Valentina',
  'Javier', 'Camila', 'Andres', 'Lucia', 'Fernando', 'Emma', 'Ricardo', 'Olivia',
  'Daniel', 'Ana', 'Pablo', 'Laura', 'Roberto', 'Carmen', 'Luis', 'Elena',
  'Antonio', 'Patricia', 'Jose', 'Monica', 'Francisco', 'Andrea', 'Manuel', 'Natalia',
  'Rafael', 'Gabriela', 'Eduardo', 'Paula', 'Sergio', 'Claudia', 'Alberto', 'Beatriz'
];

const lastNames = [
  'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez',
  'Torres', 'Flores', 'Rivera', 'Gomez', 'Diaz', 'Cruz', 'Morales', 'Ortiz',
  'Gutierrez', 'Chavez', 'Ramos', 'Reyes', 'Moreno', 'Jimenez', 'Mendoza', 'Vargas',
  'Castillo', 'Guerrero', 'Romero', 'Herrera', 'Medina', 'Aguilar', 'Castro', 'Fernandez',
  'Vasquez', 'Ruiz', 'Mendez', 'Silva', 'Delgado', 'Navarro', 'Ortega', 'Cortes'
];

function generateRandomPhone(): string {
  const countryCode = '+34';
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${countryCode}${areaCode}${number}`;
}

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomName(): { firstName: string; lastName: string } {
  return {
    firstName: getRandomElement(firstNames),
    lastName: getRandomElement(lastNames)
  };
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getRandomAvatar(): Promise<Buffer> {
  const avatarServices = [
    () => {
      const seed = Math.floor(Math.random() * 70) + 1;
      return `https://i.pravatar.cc/300?img=${seed}`;
    },
    () => {
      const gender = Math.random() > 0.5 ? 'men' : 'women';
      const seed = Math.floor(Math.random() * 99);
      return `https://randomuser.me/api/portraits/${gender}/${seed}.jpg`;
    },
    () => {
      const seed = Math.floor(Math.random() * 1000);
      return `https://i.pravatar.cc/300?u=${seed}`;
    }
  ];

  for (const getUrl of avatarServices) {
    try {
      const url = getUrl();
      return await downloadImage(url);
    } catch (error) {
      continue;
    }
  }

  throw new Error('All avatar services failed');
}

async function createUsers() {
  try {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    if (cities.length === 0) {
      console.error('❌ No active cities found in database');
      process.exit(1);
    }

    console.log(`📝 Creating ${numberOfUsersToInsert} users...`);

    for (let i = 0; i < numberOfUsersToInsert; i++) {
      try {
        const { firstName, lastName } = generateRandomName();
        let phone = generateRandomPhone();
        
        let existingUser = await prisma.user.findUnique({
          where: { phone }
        });

        while (existingUser) {
          phone = generateRandomPhone();
          existingUser = await prisma.user.findUnique({
            where: { phone }
          });
        }

        const randomCity = getRandomElement(cities);
        const password = 'password123';
        const passwordHash = await hashPassword(password);

        console.log(`  [${i + 1}/${numberOfUsersToInsert}] Creating user: ${firstName} ${lastName} (${phone})...`);

        const avatarBuffer = await getRandomAvatar();
        const avatarResult = await ImageProcessor.processAvatar(avatarBuffer, 'avatar.jpg');

        const user = await prisma.user.create({
          data: {
            phone,
            passwordHash,
            firstName,
            lastName,
            authProvider: AuthProvider.PHONE,
            currentCityId: randomCity.id,
            avatar: avatarResult.avatarPath,
            originalAvatar: avatarResult.originalPath,
            isActive: true,
          },
        });

        console.log(`  ✅ Created user: ${user.phone} (ID: ${user.id})`);
      } catch (error) {
        console.error(`  ❌ Error creating user ${i + 1}:`, error);
      }
    }

    console.log(`\n✅ Successfully created ${numberOfUsersToInsert} users`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUsers();

