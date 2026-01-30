import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BedRockService } from "src/bedrock/bedrock.service";
import { PrismaService } from "src/prisma/prisma.service";


type RetrieveChunk = {
    id: string;
    pageNumber: number;
    content:  string;
    contentType: string;
    score: number; //smaler distance is better if using <-> (L2)
};

@Injectable()
export class chatService{
    constructor(
        private prisma: PrismaService,
        private bedrock: BedRockService
    ) {}

    private vectorLiteral(v: number[]) {
        return `[${v.join(',')}]`;
    }

    async chat(params: {
        ownerUserId: string;
        documentId: string;
        sessionId?: string;
        message: string;
        topK?: number;
    }) {
        // 1) Authorise Doc
        const doc = await this.prisma.document.findUnique({
            where: {id: params.documentId},
            select: {id: true, ownerUserId: true, status:true, originalFileName: true},
        });

        if (!doc) throw new NotFoundException('Document not found');
        if (doc.ownerUserId !== params.ownerUserId)throw new ForbiddenException('No access to this document');
        if (doc.status !== 'READY') {
            throw new ForbiddenException('Document is not ready yet, Please wait for processing');
        }
        
        // 2) Get/Create chat session
        let sessionId = params.sessionId;
        if (sessionId) {
            const session = await this.prisma.chatSession.findUnique({
                where: {id: sessionId},
                select: {id: true, ownerUserId: true, documentId: true},
            });

            if(!session) throw new NotFoundException('Chat session not found');
            if (session.ownerUserId !== params.ownerUserId || session.documentId !== params.documentId) {
                throw new ForbiddenException('Invalid session for this document/user');
            }
        } else {
            const session = await this.prisma.chatSession.create({
                data: {
                    ownerUserId: params.ownerUserId,
                    documentId: doc.id,
                    title: `Chat - ${doc.originalFileName}`,
                },
                select: { id: true }
            });
            sessionId = session.id
        }

        // 3) Save user message
        await this.prisma.chatMessage.create({
            data: {
                sessionId,
                role: 'USER',
                content: params.message,
            },
        });

        // 4) Embed query
        const qEmbedding = await this.bedrock.embedText(params.message);
        const qVec = this.vectorLiteral(qEmbedding);

        const topK = params.topK ?? Number(process.env.CHAT_TOP_K || 8);

        // 5) Retrieve top chunks from pgvector
        // Use L2 distance operator (<->). Smaller = closer.
        const chunks = await this.prisma.$queryRawUnsafe<RetrieveChunk[]>(
            `
            SELECT
                c."id",
                c."pageNumber",
                c."content",
                c."contentType",
                (c."embedding" <-> $1::vector) as "score"
            FROM "DocumentChunk" c
            WHERE c."documentId" = $2
                AND c."embedding" IS NOT NULL
            ORDER BY c."embedding" <-> $1::vector
            LIMIT $3
            `, 
            qVec,
            doc.id,
            topK,
        );

        if (chunks.length === 0) {
            const assistant = await this.prisma.chatMessage.create({
                data: {
                    sessionId,
                    role: 'ASSISTANT',
                    content: `I couldn't find revelant information in the uploaded document to answer that.`,
                },
                select: { id: true, content: true, createdAt: true },
            });

            return {
                sessionId,
                answer: assistant.content,
                citations: [],
            };
        }

        // 6)Build prompt with citation labels
        const context = chunks.map((c, i) =>{
            const label = `C${i+1}`;
            return `[[${label} | page ${c.pageNumber} | ${c.contentType}]]\n${c.content}`;
        })
        .join('\n\n---\n\n');

        const system = `
You are a document-grounded assistant.
Rules:
- Answer ONLY using the provided document excerpts.
- If the answer is not in the excerpts, say you don't have enough information from the document.
- After each sentence that uses document info, include citations like [C1] or [C2].
- Do NOT cite anything not in the excerpts.
- Keep citations accurate and minimal.
`;

        const userPrompt = `
Document: ${doc.originalFileName}

EXCERPTS:
${context}

QUESTION:
${params.message}

Return:
1) A short direct answer with citations like [C1][C2]
2) A "Sources" section listing each cited label with its page number (e.g., C1 – page 4)
`;

        // 7) Ask Bedrock model to generate answer
        const answerText = await this.bedrock.generateAnswer({
            system,
            user: userPrompt,
            maxTokens: Number(process.env.CHAT_MAX_TOKENS || 700),
        });

        // 8) Store assistant message
        const assistantMsg = await this.prisma.chatMessage.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content: answerText,
            },
            select: {id: true},
        });

        // 9) Store citations (store all retrieved chunks as  "used candidates")
        // Later you can parse the answer to store ONLY cited chunks, but this is fine for MVP.
        await this.prisma.messageCitation.createMany({
            data: chunks.map((c) => ({
                messageId:  assistantMsg.id,
                chunkId: c.id,
                pageNumber:  c.pageNumber,
                quote: c.content.slice(0, 240),
                score: c.score,
            })),
        });

        return {
            sessionId,
            answer: answerText,
            citations: chunks.map((c, i) => ({
                label: `C${i + 1}`,
                chunkId: c.id,
                pageNumber: c.pageNumber,
                score: c.score,
                preview: c.content.slice(0, 160),
            })),
        };
    }
}