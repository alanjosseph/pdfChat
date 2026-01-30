import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { chatService } from "./chat.service";
import { ChatDto } from "./dto/chat.dto";


@UseGuards(JwtAuthGuard)
@Controller('api/chat')
export class ChatController {
    constructor(private chat: chatService) {}

    @Post()
    chatWithDoc(@Req() req: any, @Body() dto: ChatDto) {
        return this.chat.chat({
            ownerUserId: req.user.id,
            documentId: dto.documentId,
            sessionId: dto.sessionId,
            message: dto.message,
            topK: dto.topK,
        })
    }
}