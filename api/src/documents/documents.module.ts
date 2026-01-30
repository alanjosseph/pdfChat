import { Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";
import { S3Module } from "src/s3/s3.module";

@Module({
    imports: [S3Module],
    providers: [DocumentsService],
    controllers: [DocumentsController],
})
export class DocumentsModule {}
