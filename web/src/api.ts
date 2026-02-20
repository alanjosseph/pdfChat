import { getToken } from "./auth";


export async function fetchMe() {
    const token = getToken();

    const res = await fetch("/api/me", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        throw new Error("Not Authorised");
    }

    return res.json();
}

export async function logoutApi() {
    const token = getToken();

    if (!token) return;

    await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    }).catch((err) => {
        console.error("Logout API call failed:", err);
    });
}

export async function presignPdf(file: File) {
    const res = await fetch("/api/documents/presign", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type' : "application/json",
        },
        body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
        }),
    });

    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Presign request failed");
    return res.json() as Promise<{documentId: string; s3Key: string; uploadUrl: string;}>;
}

export async function completeUpload(documentId: string) {
    const res = await fetch("/api/documents/complete", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
    });

    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Complete upload request failed");
    return res.json() as Promise<Array<{
        id: string; 
        originalFileName: string; 
        status: string; 
        pageCount:number | null; 
        createdAt: string;
    }>>;
}

export function uploadToS3WithProgress(uploadUrl: string, file: File, onProgress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("S3 upload failed with status " + xhr.status));
        };

        xhr.onerror = () => {
            reject(new Error("S3 upload network error"));
        }
        xhr.send(file);
    });
}

export async function listMyDocuments() {
    const res = await fetch("/api/documents", {
        headers: {
            Authorization: `Bearer ${getToken()}`,
        },
    });
    if(!res.ok) throw new Error('Failed to fetch documents list');
    return res.json() as Promise<Array<{
        id: string; 
        originalFileName: string;
        status: string;
        pageCount: number;
        createdAt: string;
    }>>;
}

export async function getDocumentViewUrl(documentId: string) {
    const res = await fetch(`/api/documents/${documentId}/view`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${getToken()}`,
        },
    });

    if (!res.ok) throw new Error("Failed to get document view URL");
    return (await res.json()) as Promise<{ url: string }>;
}

export async function chatAsk(documentId: string, sessionId: string | null, message: string){
    const token = getToken();
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({documentId, sessionId: sessionId ?? undefined, message}),
    });

    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Chat failed');
    return res.json() as Promise<{ sessionId: string, answer: string; citations: any[] }>;
}
