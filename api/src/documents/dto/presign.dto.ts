import { IsString, Min, IsInt, Max } from 'class-validator';

export class PresignDto {
    @IsString()
    fileName!: string;

    @IsInt()
    @Min(1)
    @Max(50 * 1024 * 1024) // 50 MB
    fileSize!: number;
}