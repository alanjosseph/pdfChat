import { useState } from "react";
import { completeUpload, presignPdf, uploadToS3WithProgress } from "../api";


export default function PdfUploader({onUploaded}: { onUploaded: () => void }) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [error , setError] = useState<string | null>(null);

    const pickFile = async (file: File | null) => {
        setError(null);
        setProgress(null);

        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            setError("Please select a PDF file.");
            return;
        }

        setBusy(true);
        try {
            const { documentId, uploadUrl } =  await presignPdf(file);
            await uploadToS3WithProgress(uploadUrl, file, setProgress);
            await completeUpload(documentId);

            setProgress(100);
            onUploaded();
        } catch (e: any) {
            setError(e.message || "Upload failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontWeight: 700, fontSize: 13 }}>Upload PDF</label>

            <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {progress !== null && (
                <div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Progress: {progress}%</div>
                    <div style={{ height: 8, background: '#eee', borderRadius: 999 }}>
                        <div style={{ width: `${progress}%`, height: 8, background: '#8aa2ff', borderRadius: 999 }} />
                    </div>
                </div>
            )}

            {error && <div style={{ color: 'crimson', fontSize: 12 }}>{error}</div>}

            <div style={{ fontSize: 12, opacity: 0.7 }}>
                Upload goes directly to S3 using a presigned URL (fast + scalable).
            </div>
        </div>
    );
}