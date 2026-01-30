import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";


@Injectable()
export class S3Service {
    private s3 = new S3Client({ 
        region: process.env.AWS_REGION,
        requestChecksumCalculation: "WHEN_REQUIRED",
        requestChecksumValidation: "WHEN_REQUIRED"
    }as any);

    async presignPut(params: {
        bucket: string,
        key: string,
        contentType: string,
        expiresSecond: number
    }) {
        const command = new PutObjectCommand({
            Bucket: params.bucket,
            Key: params.key,
            ContentType: params.contentType
        });

        const url = await getSignedUrl(this.s3, command, { expiresIn: params.expiresSecond });
        return url;
    }
}