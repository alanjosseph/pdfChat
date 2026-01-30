import { IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

export class ChatDto {
    @IsUUID()
    documentId!: string;

    @IsOptional()
    @IsUUID()
    sessionId?: string;

    @IsString()
    @MinLength(1)
    message!: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20)
    topK?: number;
}