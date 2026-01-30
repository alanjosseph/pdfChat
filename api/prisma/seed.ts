import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const users = [
        {userId: 'admin', name: 'Admin', password: 'adminpassword@123'},
        {userId: 'user1', name: 'User One', password: 'useronepassword@123'}
    ];

    for (const userData of users) {
        const passwordHash = await bcrypt.hash(userData.password, 10);
        
        await prisma.user.upsert({
            where: { userId: userData.userId },
            update: { name: userData.name, passwordHash },
            create: {
                userId: userData.userId,
                name: userData.name,
                passwordHash,
            }
        });
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });