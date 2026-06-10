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
        <div className="dashboard-uploader">
            <label className="dashboard-uploader-label">Upload PDF</label>

            <input
                className="dashboard-file-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {progress !== null && (
                <div>
                    <div className="dashboard-progress-label">Progress: {progress}%</div>
                    <div className="dashboard-progress-track">
                        <div className="dashboard-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {error && <div className="dashboard-uploader-error">{error}</div>}

            <div className="dashboard-uploader-note">
                Upload goes directly to S3 using a presigned URL (fast + scalable).
            </div>
        </div>
    );
}
