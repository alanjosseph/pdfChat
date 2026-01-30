import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { GetDocumentAnalysisCommand, StartDocumentAnalysisCommand, TextractClient } from '@aws-sdk/client-textract';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WORKER_ID = process.env.WORKER_ID || `worker-${Math.random().toString(16).slice(2)}`;
const POLL_MS = Number(process.env.INGESTION_POLL_MS || 2000);

const textract = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

async function claimJob() {
    const job = await prisma.documentIngestionJob.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
    });

    if(!job) return null;

    const updated = await prisma.documentIngestionJob.updateMany({
        where: {
            id: job.id,
            status: 'QUEUED',
        },
        data: {
            status: 'RUNNING',
            lockedAt: new Date(),
            lockedBy: WORKER_ID,
            attempts: { increment: 1 },
        },
    });

    if(updated.count === 0) return null;

    return prisma.documentIngestionJob.findUnique({ where: { id: job.id } });
}

async function markFailed(jobId: string, error: any) {
    const msg = (error?.message || String(error)).slice(0, 2000);
    await prisma.documentIngestionJob.update({
        where: { id: jobId },
        data: {
            status: 'FAILED',
            lastError: msg,
        }
    });
}

async function markSuccess(jobId: string) {
    await prisma.documentIngestionJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', lastError: null },
    });
}

/**
 * Ingestion pipeline (MVP skeleton)
 * 1) Read doc metadata (S3 location)
 * 2) Textract async extraction -> per-page text (and tables)
 * 3) Chunk text per page, store DocumentPage + DocumentChunk
 * 4) Create embeddings (Titan) and save to pgvector column
 * 5) Mark Document READY + set pageCount
 */

async function ingestDocument( documentId: string) {
    const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, s3Bucket: true, s3Key: true, status: true },
    });

    if(!doc) throw new Error('Document not found');

    // 1) Textract blocks (TABLES + LAYOUT). PDFs must be in S3. :contentReference[oaicite:3]{index=3}
    const blocks = await runTextractAnalysis(doc.s3Bucket, doc.s3Key);

    // 2) Extract per-page text and tables
    const pageText = extractPageText(blocks);
    const pageTables = extractPageTables(blocks);

    const pageNumbers = Array.from(new Set([
        ...pageText.keys(),
        ...pageTables.keys(),
    ])).sort((a, b) => a - b);

    const pageCount = pageNumbers.length || 0;

    // 3) Write pages + chunks + embeddings
    for (const pageNumber of pageNumbers) {
        const text = pageText.get(pageNumber) || '';
        const tables = pageTables.get(pageNumber) || [];

    // Save page record
        await prisma.documentPage.upsert({
            where: { documentId_pageNumber: {documentId: doc.id, pageNumber }},
            update: {text: text },
            create: { documentId: doc.id, pageNumber, text: text },
        });

        const textChunks = chunkText(text, 1200);
        let chunkIndex = 0;

        // Store chunks with embeddings
        for (const c of textChunks) {
            const chunkRow = await prisma.documentChunk.create({
                data: {
                    documentId: documentId,
                    pageNumber: pageNumber,
                    chunkIndex: chunkIndex++,
                    content:c,
                    contentType: 'TEXT',
                },
                select: { id: true },
            });

            const emb = await embedText(c);
            await setChunkEmbedding(chunkRow.id, emb);
        }

        // TABLE chunks (each table as its own chunk)
        for (const t of tables) {
            const chunkRow = await prisma.documentChunk.create({
                data: {
                    documentId: doc.id,
                    pageNumber,
                    chunkIndex: chunkIndex++,
                    content: t,
                    contentType: 'TABLE',
                },
                select: { id: true },
            });

            const emb = await embedText(t);
            await setChunkEmbedding(chunkRow.id, emb);
        }
    }

    // Set doc READY (pageCount will be real when we have Textract)
    await prisma.document.update({
        where: { id: documentId },
        data: { status: 'READY', pageCount },
    });
}

function chunkText(text: string, maxChars: 1200) {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        chunks.push(text.slice(start, start + maxChars));
        start += maxChars;
    }
    return chunks.map(chunk => chunk.trim()).filter(Boolean);
}

/** Build a quick lookup: id -> block */
function mapBlocks(blocks: any[]) {
    const  m = new Map<string, any>();
    for (const block of blocks) {
        m.set(block.Id, block);
    }
    return m;
}

/** Extract per-page LINE text */
function extractPageText(blocks: any[]) {
    const pages= new Map<number, string[]>();
    for (const block of blocks) {
        if (block.BlockType === 'LINE' && typeof block.Page === 'number' && block.Text) {
            if (!pages.has(block.Page)) {
                pages.set(block.Page, []);
            }
            pages.get(block.Page)!.push(block.Text);
        }   
    }

    // join lines in reading-ish order (Textract doesn't guarantee perfect order)
    const out = new Map<number, string>();
    for (const [pageNum, texts] of pages.entries()) {
        out.set(pageNum, texts.join('\n'));
    }
    return out;
}

/** Extract tables per page as a readable text representation */
function extractPageTables(blocks: any[]) {
    const idMap = mapBlocks(blocks);
    const tablesByPage = new Map<number, string[]>();

    const tableBlocks = blocks.filter(b => b.BlockType === 'TABLE' && typeof b.Page === 'number');
    for (const tableBlock of tableBlocks) {
        const pageNum = tableBlock.Page as number;
        const rows= new Map<number , Map<number, string>>();

        //TAble -> child relations -> cell ids
        const rels = tableBlock.Relationships || [];
        const childRel = rels.find((r:any) => r.Type === 'CHILD');
        const cellIds: string[] = childRel?.Ids || [];

        for (const cellId of cellIds) {
            const cell = idMap.get(cellId);
            if(!cell || cell.BlockType != 'CELL') continue;

            const r = cell.RowIndex || 1;
            const c = cell.ColumnIndex || 1;
            
            //CELL -> CHILD relationships -> WORD ids
            const cellRels = cell.Relationships || [];
            const cellChild = cellRels.find((rr: any) => rr.Type === 'CHILD');
            const wordIds: string[] = cellChild?.Ids || [];

            const words: string[] = [];
            for (const wid of wordIds) {
                const w = idMap.get(wid);
                if (w?.BlockType === 'WORD' && w.Text) words.push(w.Text);
            }

            if (!rows.has(r)) rows.set(r, new Map());
            rows.get(r)!.set(c, words.join(' '));
        }

        //Convert to simple markdoenish table text
        const rowNums = Array.from(rows.keys()).sort((a, b) => a-b);
        const textRows: string[] = [];
        for (const rn of rowNums) {
            const cols = rows.get(rn)!;
            const colNums = Array.from(cols.keys()).sort((a, b) => a-b)
            const line = colNums.map(cn => cols.get(cn) || '').join(' | ');
            textRows.push(line);
        }

        const tableText = `TABLE (page ${pageNum}):\n` + textRows.join('\n');
        if(!tablesByPage.has(pageNum)) tablesByPage.set(pageNum, []);
        tablesByPage.get(pageNum)!.push(tableText);
    }

    return tablesByPage;
}

/** Call Titan Text Embeddings V2 (1024 dims) */
async function embedText(inputText: string): Promise<number[]> {
    const modelId = process.env.BEDROCK_EMBED_MODEL_ID || 'amazon.titan-embed-text-v2:0';
    const dims = Number(process.env.BEDROCK_EMBED_DIMENSIONS || 1024);

    const body = JSON.stringify({
        inputText,
        dimensions: dims,
        normalize: true
    });

    const resp = await bedrock.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body)
    }));

    const json = JSON.parse(new TextDecoder().decode(resp.body))
    // Titan embeddings return an embedding array in the response
    // (Field name documented as embedding/embeddings depending on model; handle both safely)
    const embedding = json.embedding || json.embeddings;
    if(!embedding || !Array.isArray(embedding)) throw new Error('Bedrock embedding response missing embedding array');
    return embedding as number[];
}

/** Write vector to pgvector column via raw SQL */
async function setChunkEmbedding(chunkId: string, embedding: number[]) {
    // pgvector accepts format like '[0.1,0.2]'
    const vectorLiteral = `[${embedding.join(',')}]`;
    await prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET "embedding" = $1::vector WHERE "id" = $2`,
        vectorLiteral,
        chunkId
    );
}

async function runTextractAnalysis(bucket: string, key: string) {
    //start async analysis for tables + layout
    const start  = await textract.send(new StartDocumentAnalysisCommand({
        DocumentLocation: {S3Object: {Bucket: bucket, Name: key}},
        FeatureTypes: ['TABLES', 'LAYOUT']
    }));

    const jobId = start.JobId;
    if (!jobId) throw new Error('Textract did not return JobID');

    const maxPolls = Number(process.env.TEXTRACT_MAX_POLLS || 600);
    const pollMs = Number(process.env.TEXTRACT_POLL_MS || 2000);

    let nextToken: string | undefined = undefined;
    let polls = 0;
    let status: string | undefined;

    const allBlocks: any[] = [];

    //Wait until jon SUCCEEDED,  then page through results
    while (polls < maxPolls) {
        polls++;

        const res = await textract.send(new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken,
            MaxResults:  1000
        }));

        status = res.JobStatus;

        if (status === 'FAILED') {
            throw new Error(`Textract failed: ${res.StatusMessage || 'no status message'}`);
        }

        if (status === 'IN_PROGRESS') {
            await sleep(pollMs);
            continue;
        }

        if (status === 'SUCCEEDED') {
            const blocks = res.Blocks || [];
            allBlocks.push(...blocks);
            nextToken = res.NextToken;
            if (!nextToken) break;
        }
    }

    if (status !== 'SUCCEEDED') throw new Error('Textract timed out waiting for SUCCEEDED');
    return allBlocks;
}


async function main() {
    console.log(`Ingestion worker started with ID ${WORKER_ID}`);

    while (true) {
        try {
            const job = await claimJob();
            if (!job) {
                // No job found, sleep and retry
                await sleep(POLL_MS);
                continue;
            }
            
            console.log(`Worker ${WORKER_ID} processing job ${job.id} for document ${job.documentId}`);

            try {
                await ingestDocument(job.documentId);
                await markSuccess(job.id);
                console.log(`Worker ${WORKER_ID} successfully processed document ${job.documentId}`);
            } catch (error) {
                console.error(`Worker ${WORKER_ID} failed to process document ${job.documentId}:`, error);

                await prisma.document.update({
                    where: { id: job.documentId },
                    data: { status: 'FAILED' },
                }).catch((err) => {});

                await markFailed(job.id, error);
            }
        } catch (err) {
            console.error(`Worker ${WORKER_ID} encountered an error:`, err);
            await sleep(POLL_MS);
        }
    }
}

main().catch((err) => {
    console.error('Fatal error in ingestion worker:', err);
    process.exit(1);
});