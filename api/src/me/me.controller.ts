import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('/api')
export class MeController {
    @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@Req() req: any) {
        console.log('MeController.me called');
        console.log('Authenticated user:', req.user);
        // req.user comes from JwtStrategy.validate()
        return req.user;
    }
}
