import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateUserDto) {
        try {
            const passwordHash = await bcrypt.hash(dto.password, 10);

            const user = await this.prisma.user.create({
                data: {
                    userId: dto.userId,     // ✅ correct field name
                    name: dto.name,
                    passwordHash,
                },
                select: { id: true, userId: true, name: true, createdAt: true }, // don’t return hash
            });

            // Return only safe fields
            return user;
        } catch (err: any) {
            // Prisma unique constraint violation
            if (err?.code === 'P2002') {
                throw new ConflictException('USerID already exists');
            }
            throw err;
        }
    }

    async findAll() {
        return this.prisma.user.findMany({
            select: { id: true, userId: true, name: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
    }
}
