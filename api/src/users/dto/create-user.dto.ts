import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @MinLength(3)
    userId!: string;

    @IsOptional()
    @IsString()
    @MinLength(2)
    name?: string;

    @IsString()
    @MinLength(8)
    password!: string;
}
