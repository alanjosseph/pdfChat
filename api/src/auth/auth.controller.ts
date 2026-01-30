import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "src/users/dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";


@Controller('/api/auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto.userId, dto.password);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout() {
        // No server-side action needed for JWT logout
        return { message: 'Logged out successfully' };
    }
}