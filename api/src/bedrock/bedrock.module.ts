import { Module } from "@nestjs/common";
import { BedRockService } from "./bedrock.service";

@Module({
    providers: [BedRockService],
    exports: [BedRockService],
})
export class BedrockModule {}