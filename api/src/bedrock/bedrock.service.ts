import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Injectable } from "@nestjs/common";
import { normalize } from "path";


@Injectable()
export class BedRockService {
    private client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

    async embedText(inputText: string): Promise<number[]> {
        const modelId = process.env.BEDROCK_EMBED_MODEL_ID || 'amazon.titan-embed-text-v2.0';
        const dims = Number(process.env.BEDROCK_EMBED_DIMENSIONS || 1024);

        const body = JSON.stringify({
            inputText,
            dimensions: dims,
            normalize: true,
        });

        const resp = await this.client.send(new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: new TextEncoder().encode(body)
        }));

        const json = JSON.parse(new TextDecoder().decode(resp.body));
        const embedding = json.embedding || json.embeddings;
        if (!embedding || !Array.isArray(embedding)) throw new Error('Bedrock embedding missing embedding array');
        return embedding as number[];
    }

    async generateAnswer(params: {
        system: string;
        user: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string> {
        // ✅ Nova Pro model id (region-agnostic)
        // Bedrock supported-models list includes amazon.nova-pro-v1:0 :contentReference[oaicite:1]{index=1}
        const modelId = process.env.BEDROCK_CHAT_MODEL_ID || "amazon.nova-pro-v1:0";

        const maxTokens = params.maxTokens ?? Number(process.env.CHAT_MAX_TOKENS || 700);
        const temperature = params.temperature ?? 0.2;

        const cmd = new ConverseCommand({
            modelId,
            system: [{ text: params.system }], // system prompt supported in Converse :contentReference[oaicite:2]{index=2}
            messages: [
                {
                    role: "user",
                    content: [{ text: params.user }],
                },
            ],
            inferenceConfig: {
                maxTokens,
                temperature,
            },
        });

        const resp = await this.client.send(cmd);

        const out = resp?.output?.message?.content?.[0]?.text;
        if (!out) throw new Error("Nova Pro returned empty response");
        return out;
    }
}