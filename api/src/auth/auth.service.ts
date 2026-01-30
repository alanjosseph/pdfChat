import { Injectable, UnauthorizedException } from "@nestjs/common";
import {PrismaService} from "../prisma/prisma.service";
import * as bcrypt from 'bcrypt';
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
    ) {}

    async login(userId: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: { userId },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Later replace this with JWT (recommended).
        const payload = { sub: user.id, userId: user.userId };
        const accessToken = await this.jwt.signAsync(payload);

        return {
            token: accessToken,
            user: { id: user.id, userId: user.userId, name: user.name },
        };
    }
}