import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ok } from "assert";
import { log } from "console";
import { randomUUID } from "crypto";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/s3/s3.service";


function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^\w.\- ]+/g, '').trim();
}

@Injectable()
export class DocumentsService {

    private s3C = new S3Client({ region: process.env.AWS_REGION });

    constructor(
        private prisma: PrismaService,
        private s3: S3Service,
    ) {}

    async createPresignedUpload(params: {
        ownerUserId: string,
        fileName: string,
        fileSize: number,
    }) {
        const maxBytes = Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES || 50 * 1024 * 1024);
        if (params.fileSize > maxBytes) {
            throw new Error(`File size exceeds the maximum allowed size of ${maxBytes} bytes.`);
        }

        const safeFileName = sanitizeFileName(params.fileName);
        if (!safeFileName.toLowerCase().endsWith('.pdf')) {
            throw new BadRequestException('Only PDF files are allowed.');
        }

        const bucket = process.env.S3_BUCKET!;
        if (!bucket) {
            throw new Error('S3_BUCKET is not configured in environment variables.');
        }

        const documentId = randomUUID();
        const s3Key = `users/${params.ownerUserId}/documents/${documentId}.pdf`;

        //Create a new document record in the database
        const document = await this.prisma.document.create({
            data: {
                id: documentId,
                ownerUserId: params.ownerUserId,
                originalFileName: safeFileName,
                s3Bucket: bucket,
                s3Key, 
                status: 'UPLOADED',
            },
        });

        const uploadUrl = await this.s3.presignPut({
            bucket,
            key: s3Key,
            contentType: 'application/pdf',
            expiresSecond: Number(process.env.PRESIGN_EXPIRES_SECONDS || 900),
        })

        return {documentId: document.id, s3Key, uploadUrl};
    }

    async markUploadComplete(params: {ownerUserId: string, documentId: string}) {
        const doc = await this.prisma.document.findUnique({
            where: { id: params.documentId },
            select: { id:true ,ownerUserId: true, status: true },
        });

        if(!doc) throw new NotFoundException('Document not found');
        if(doc.ownerUserId !== params.ownerUserId) {
            throw new ForbiddenException('You do not have permission to access this document');
        }

        await this.prisma.document.update({
            where: { id: params.documentId },
            data: { status: 'PROCESSING' },
        });

        await this.prisma.documentIngestionJob.upsert({
            where: { documentId: params.documentId },
            update: { status: 'QUEUED', attempts: 0, lastError: null, lockedAt:null, lockedBy: null },
            create: { documentId: params.documentId, status: 'QUEUED' },
            
        })

        return {ok: true}
    };

    async listMine(ownerUserId: string) {
        return this.prisma.document.findMany({
            where: { ownerUserId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                originalFileName: true,
                status: true,
                pageCount: true,
                createdAt: true,
            }
        });
    }

    async getPresignedViewUrl(params: {ownerUserId: string, documentId: string}) {
        const doc = await this.prisma.document.findUnique({
            where: { id: params.documentId },
            select: {
                id:true,
                ownerUserId: true,
                s3Bucket: true,
                s3Key: true,
                originalFileName: true,
            },
        });

        if(!doc) throw new NotFoundException('Document not found');
        if(doc.ownerUserId !== params.ownerUserId) {
            throw new ForbiddenException('You do not have permission to access this document');
        }

        const url = await getSignedUrl(
            this.s3C,
            new GetObjectCommand({
                Bucket: doc.s3Bucket,
                Key: doc.s3Key,
                ResponseContentType: 'application/pdf',
                ResponseContentDisposition: `inline; filename="${doc.originalFileName}"`
            }),
            { expiresIn: Number(process.env.PRESIGN_EXPIRES_SECONDS || 600) }
        );

        return { url };
    }
}