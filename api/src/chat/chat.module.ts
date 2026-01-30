import { Module } from '@nestjs/common';
import { BedrockModule } from 'src/bedrock/bedrock.module';
import { ChatController } from './chat.controller';
import { chatService } from './chat.service';


@Module({
    imports: [BedrockModule],
    controllers: [ChatController],
    providers: [chatService],
})
export class ChatModule {}