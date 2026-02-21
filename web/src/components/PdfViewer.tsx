import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
    fileUrl: string;
    targetPage?: number | null; // <- when this changes, we scroll
    headers?: Record<string, string>;
};

export default function PdfViewer({ fileUrl, targetPage, headers }: Props) {
    const [numPages, setNumPages] = useState(0);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState<number>(700);

    // One ref per page container so we can scroll to it
    const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // Responsive width so pages don't get cropped
    useEffect(() => {
        if (!wrapRef.current) return;
        const el = wrapRef.current;

        const ro = new ResizeObserver(() => {
            setWidth(Math.max(320, el.clientWidth - 24));
        });

        ro.observe(el);
        setWidth(Math.max(320, el.clientWidth - 24));
        return () => ro.disconnect();
    }, []);

    // If PDF requires auth headers, use object form
    const file = useMemo(() => {
        return headers ? { url: fileUrl, httpHeaders: headers } : fileUrl;
    }, [fileUrl, headers]);

    // Smooth scroll when targetPage changes
    useEffect(() => {
        if (!targetPage) return;
        const node = pageRefs.current[targetPage];
        if (!node) return;

        node.scrollIntoView({ behavior: "smooth", block: "start" });

        // Optional: quick highlight effect
        node.animate(
            [{ background: "rgba(99,102,241,0.18)" }, { background: "transparent" }],
            { duration: 600 }
        );
    }, [targetPage]);

    return (
        <div
            ref={wrapRef}
            style={{ height: "100%", overflow: "auto", padding: 10 }}
        >
            <Document
                file={file}
                loading={<div style={{ opacity: 0.7 }}>Loading PDF…</div>}
                onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
                onLoadError={(e) => console.error("Failed to load PDF:", e)}
            >
                {Array.from({ length: numPages }, (_, i) => {
                    const pageNumber = i + 1;
                    return (
                        <div
                            key={pageNumber}
                            ref={(el) => {
                                pageRefs.current[pageNumber] = el;
                            }}
                            style={{
                                padding: "10px 0",
                                borderBottom: "1px solid rgba(0,0,0,0.06)",
                                scrollMarginTop: 12,
                            }}
                        >
                            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>
                                Page {pageNumber}
                            </div>

                            <Page
                                pageNumber={pageNumber}
                                width={width}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                            />
                        </div>
                    );
                })}
            </Document>
        </div>
    );
}