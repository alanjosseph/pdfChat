import { IsString, IsUUID } from "class-validator";

export class CompleteUploadDto {
    @IsUUID()
    documentId!: string;
}