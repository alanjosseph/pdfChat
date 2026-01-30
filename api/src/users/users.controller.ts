import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('/api/users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Post()
    async createUser(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Get()
    async getUsers() {
        return this.usersService.findAll();
    }
}
