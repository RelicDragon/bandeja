import prisma from './src/config/database';
import { hashPassword } from './src/utils/hash';
import { AuthProvider } from '@prisma/client';

async function createAdmin() {
  const phone = process.argv[2];
  const password = process.argv[3];
  const firstName = process.argv[4] || 'Admin';
  const lastName = process.argv[5] || 'User';

  if (!phone || !password) {
    console.error('Usage: ts-node create-admin.ts <phone> <password> [firstName] [lastName]');
    process.exit(1);
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      const updatedUser = await prisma.user.update({
        where: { phone },
        data: { isAdmin: true },
      });
      console.log('✅ User updated to admin:', updatedUser.phone);
    } else {
      const passwordHash = await hashPassword(password);
      const admin = await prisma.user.create({
        data: {
          phone,
          passwordHash,
          firstName,
          lastName,
          authProvider: AuthProvider.PHONE,
          isAdmin: true,
        },
      });
      console.log('✅ Admin user created successfully:', admin.phone);
    }
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

