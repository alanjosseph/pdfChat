import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { DocumentsService } from "./documents.service";
import { PresignDto } from "./dto/presign.dto";
import { CompleteUploadDto } from "./dto/complete.dto";


@UseGuards(JwtAuthGuard) 
@Controller('api/documents')
export class DocumentsController {
    constructor(private docs: DocumentsService) {}

    @Post('presign')
    presign(@Req() req: any, @Body() dto: PresignDto) {
        return this.docs.createPresignedUpload({
            ownerUserId: req.user.id,
            fileName: dto.fileName,
            fileSize: dto.fileSize,
        });
    }

    @Post('complete')
    complete(@Req() req: any, @Body() dto: CompleteUploadDto) {
        return this.docs.markUploadComplete({
            ownerUserId: req.user.id,
            documentId: dto.documentId,
        });
    }

    @Get()
    listMine(@Req() req: any) {
        return this.docs.listMine(req.user.id);
    }
}