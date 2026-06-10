import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
    fileUrl: string;
    targetPage?: number | null;
    headers?: Record<string, string>;
    freezeResize?: boolean;
    resizeVersion?: number;
};

export default function PdfViewer({
    fileUrl,
    targetPage,
    headers,
    freezeResize = false,
    resizeVersion = 0,
}: Props) {
    const [numPages, setNumPages] = useState(0);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState<number>(700);

    const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const measureWidth = useCallback(() => {
        if (!wrapRef.current) return;
        setWidth(Math.max(320, wrapRef.current.clientWidth - 24));
    }, []);

    useEffect(() => {
        if (!wrapRef.current) return;
        const el = wrapRef.current;

        const ro = new ResizeObserver(() => {
            if (!freezeResize) {
                setWidth(Math.max(320, el.clientWidth - 24));
            }
        });

        ro.observe(el);
        if (!freezeResize) {
            setWidth(Math.max(320, el.clientWidth - 24));
        }
        return () => ro.disconnect();
    }, [freezeResize]);

    useEffect(() => {
        if (!freezeResize) {
            measureWidth();
        }
    }, [freezeResize, measureWidth, resizeVersion]);

    const file = useMemo(() => {
        return headers ? { url: fileUrl, httpHeaders: headers } : fileUrl;
    }, [fileUrl, headers]);

    useEffect(() => {
        if (!targetPage) return;
        const node = pageRefs.current[targetPage];
        if (!node) return;

        node.scrollIntoView({ behavior: "smooth", block: "start" });
        node.animate(
            [{ background: "rgba(96, 165, 250, 0.16)" }, { background: "#f8fafc" }],
            { duration: 600 },
        );
    }, [targetPage]);

    return (
        <div ref={wrapRef} className="pdf-viewer-scroll">
            <Document
                file={file}
                loading={<div className="pdf-viewer-loading">Loading PDF...</div>}
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
                            className="pdf-viewer-page"
                        >
                            <div className="pdf-viewer-page-label">
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
