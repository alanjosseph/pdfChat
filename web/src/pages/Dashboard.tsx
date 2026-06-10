import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchMe, logoutApi, listMyDocuments, chatAsk, getDocumentViewUrl, deleteDocument } from '../api';
import { clearAuth } from '../auth';
import { useNavigate } from 'react-router-dom';
import PdfUploader from '../components/PdfUploader';
import PdfViewer from '../components/PdfViewer';
import logo from '../assets/Logo3.png';
import sidebarIcon from '../assets/sidebar.png';
import './dashboard.css';

type Citation = {
    label: string;
    pageNumber: number;
    preview?: string;
    chunkId?: string;
    score?: number;
};

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    citations?: Citation[];
};

type DocItem = {
    id: string;
    originalFileName: string;
    status: string;
    pageCount: number | null;
    createdAt: string;
};

const formatStatus = (status: string) => status.toLowerCase().replace(/_/g, ' ');
const SIDEBAR_TRANSITION_MS = 620;

export default function Dashboard() {
    const navigate = useNavigate();
    const [me, setMe] = useState<any>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [pdfResizePaused, setPdfResizePaused] = useState(false);
    const [pdfResizeVersion, setPdfResizeVersion] = useState(0);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');

    const [docs, setDocs] = useState<DocItem[]>([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const [sending, setSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    const [chatByDoc, setChatByDoc] = useState<Record<string, ChatMessage[]>>({});
    const [sessionByDoc, setSessionByDoc] = useState<Record<string, string | null>>({});

    const [pdfBaseUrl, setPdfBaseUrl] = useState<string | null>(null);
    const [targetPdfPage, setTargetPdfPage] = useState<number | null>(null);

    const chatByDocRef = useRef(chatByDoc);
    const sessionByDocRef = useRef(sessionByDoc);
    const sidebarTransitionTimerRef = useRef<number | null>(null);

    useEffect(() => { chatByDocRef.current = chatByDoc; }, [chatByDoc]);
    useEffect(() => { sessionByDocRef.current = sessionByDoc; }, [sessionByDoc]);

    useEffect(() => {
        return () => {
            if (sidebarTransitionTimerRef.current !== null) {
                window.clearTimeout(sidebarTransitionTimerRef.current);
            }
        };
    }, []);

    const selectedDoc = useMemo(
        () => docs.find((d) => d.id === selectedDocumentId) ?? null,
        [docs, selectedDocumentId],
    );

    useEffect(() => {
        fetchMe()
            .then(setMe)
            .catch(() => {
                clearAuth();
                navigate('/', { replace: true });
            });
    }, [navigate]);

    const logout = async () => {
        await logoutApi();
        clearAuth();
        navigate('/', { replace: true });
    };

    const reloadDocs = async () => {
        try {
            const docsList = await listMyDocuments();
            setDocs(docsList);

            if (!selectedDocumentId) {
                const firstReady = docsList.find((d: DocItem) => d.status === 'READY');
                if (firstReady) {
                    await selectDoc(firstReady.id);
                }
            }
        } catch (e) {
            console.error('Failed to load documents:', e);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        reloadDocs();
    }, []);

    useEffect(() => {
        const hasPending = docs.some(d => d.status === 'PROCESSING' || d.status === 'UPLOADED');
        if (!hasPending) return;

        const id = setInterval(() => {
            reloadDocs();
        }, 1000);

        return () => clearInterval(id);
    }, [docs]);

    const startNewChat = () => {
        if (!selectedDocumentId) {
            setMessages([]);
            setSessionId(null);
            setChatError(null);
            setInput('');
            return;
        }

        setMessages([]);
        setSessionId(null);
        setChatError(null);
        setInput('');

        setChatByDoc(prev => ({ ...prev, [selectedDocumentId]: [] }));
        setSessionByDoc(prev => ({ ...prev, [selectedDocumentId]: null }));
    };

    const selectDoc = async (docId: string) => {
        if (selectedDocumentId) {
            setChatByDoc(prev => ({ ...prev, [selectedDocumentId]: messages }));
            setSessionByDoc(prev => ({ ...prev, [selectedDocumentId]: sessionId }));
        }

        setSelectedDocumentId(docId);
        setMessages(chatByDocRef.current[docId] ?? []);
        setSessionId(sessionByDocRef.current[docId] ?? null);

        setChatError(null);
        setInput('');

        try {
            const { url } = await getDocumentViewUrl(docId);
            setPdfBaseUrl(url);
        } catch (e) {
            setPdfBaseUrl(null);
        }
    };

    const sendMessage = async () => {
        const text = input.trim();
        if (!text) return;

        if (!selectedDocumentId) {
            setChatError('Select a document first');
            return;
        }

        if (selectedDoc?.status !== 'READY') {
            setChatError('That document is not ready yet. Please wait for processing.');
            return;
        }

        setChatError(null);
        setSending(true);

        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => {
            const next = [...prev, userMsg];
            if (selectedDocumentId) {
                setChatByDoc(map => ({ ...map, [selectedDocumentId]: next }));
            }
            return next;
        });
        setInput('');

        try {
            const resp = await chatAsk(selectedDocumentId, sessionId, text);

            const botMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: resp.answer,
                timestamp: new Date().toISOString(),
                citations: resp.citations || [],
            };
            setMessages(prev => {
                const next = [...prev, botMsg];
                setChatByDoc(map => ({ ...map, [selectedDocumentId]: next }));
                return next;
            });

            setSessionId(resp.sessionId);
            setSessionByDoc(prev => ({ ...prev, [selectedDocumentId]: resp.sessionId }));
        } catch (e: any) {
            setChatError(e.message || 'Chat failed');
        } finally {
            setSending(false);
        }
    };

    const deleteSelectedPdf = async () => {
        if (!selectedDoc) return;

        const confirmed = window.confirm(
            `Delete "${selectedDoc.originalFileName}"? This will remove the PDF and its chat history.`,
        );
        if (!confirmed) return;

        setChatError(null);

        try {
            const docId = selectedDoc.id;
            await deleteDocument(docId);

            const remainingDocs = docs.filter((d) => d.id !== docId);
            setDocs(remainingDocs);

            setChatByDoc((prev) => {
                const { [docId]: _removed, ...rest } = prev;
                return rest;
            });
            setSessionByDoc((prev) => {
                const { [docId]: _removed, ...rest } = prev;
                return rest;
            });

            setMessages([]);
            setSessionId(null);
            setInput('');
            setPdfBaseUrl(null);
            setTargetPdfPage(null);
            setSelectedDocumentId(null);

            const nextReady = remainingDocs.find((d) => d.status === 'READY');
            if (nextReady) {
                await selectDoc(nextReady.id);
            }
        } catch (e: any) {
            setChatError(e.message || 'Failed to delete PDF');
        }
    };

    const toggleSidebar = () => {
        setSidebarCollapsed((collapsed) => !collapsed);
        setPdfResizePaused(true);

        if (sidebarTransitionTimerRef.current !== null) {
            window.clearTimeout(sidebarTransitionTimerRef.current);
        }

        sidebarTransitionTimerRef.current = window.setTimeout(() => {
            setPdfResizePaused(false);
            setPdfResizeVersion((version) => version + 1);
            sidebarTransitionTimerRef.current = null;
        }, SIDEBAR_TRANSITION_MS);
    };

    return (
        <div className="dashboard-page">
            <header className="dashboard-topbar">
                <div className="dashboard-brand">
                    <img src={logo} className="dashboard-logo" alt="Document AI" />
                    <div className="dashboard-brand-text">
                        <div className="dashboard-product-name">Document AI</div>
                        <div className="dashboard-session">
                            {me ? `Signed in as ${me.userId}${me.name ? ` (${me.name})` : ''}` : 'Loading...'}
                        </div>
                    </div>
                </div>

                <button onClick={logout} className="dashboard-button dashboard-button-secondary">
                    Logout
                </button>
            </header>

            <main className={`dashboard-layout${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
                <aside className={`dashboard-panel dashboard-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
                    <div className="dashboard-panel-heading">
                        <div className="dashboard-sidebar-title">
                            <p className="dashboard-kicker">Library</p>
                            <h2>PDFs</h2>
                        </div>
                        <div className="dashboard-sidebar-actions">
                            <button
                                className="dashboard-icon-button"
                                onClick={toggleSidebar}
                                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                                aria-expanded={!sidebarCollapsed}
                                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                <img
                                    src={sidebarIcon}
                                    alt=""
                                    className="dashboard-sidebar-icon"
                                />
                            </button>
                            <button
                                className="dashboard-button dashboard-button-danger dashboard-delete-button"
                                onClick={deleteSelectedPdf}
                                disabled={!selectedDoc}
                                title={selectedDoc ? `Delete ${selectedDoc.originalFileName}` : 'Select a PDF to delete'}
                            >
                                Delete
                            </button>
                        </div>
                    </div>

                    <div className="dashboard-sidebar-body">
                        <PdfUploader onUploaded={reloadDocs} />

                        <div className="dashboard-section-title">My PDFs</div>

                        <div className="dashboard-document-list">
                            {docs.length === 0 ? (
                                <div className="dashboard-empty-mini">No documents yet.</div>
                            ) : (
                                docs.map((d) => {
                                    const isSelected = d.id === selectedDocumentId;
                                    const statusClass = `dashboard-status dashboard-status-${d.status.toLowerCase()}`;

                                    return (
                                        <button
                                            key={d.id}
                                            onClick={() => selectDoc(d.id)}
                                            className={`dashboard-document-card${isSelected ? ' is-selected' : ''}`}
                                            title={d.status === 'READY' ? 'Ready' : 'Processing'}
                                        >
                                            <div className="dashboard-document-name">{d.originalFileName}</div>
                                            <div className="dashboard-document-meta">
                                                <span className={statusClass}>{formatStatus(d.status)}</span>
                                                {d.pageCount ? <span>{d.pageCount} pages</span> : null}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </aside>

                <section className="dashboard-panel dashboard-chat">
                    <div className="dashboard-panel-header">
                        <div>
                            <p className="dashboard-kicker">Assistant</p>
                            <h2>AI Chat</h2>
                            <span className="dashboard-panel-subtitle">
                                {selectedDoc
                                    ? `Using ${selectedDoc.originalFileName} (${formatStatus(selectedDoc.status)})`
                                    : 'Select a PDF to start'}
                            </span>
                        </div>

                        <div className="dashboard-chat-actions">
                            <button className="dashboard-button dashboard-button-secondary" onClick={startNewChat}>
                                Clear chat
                            </button>
                            {sending && <span className="dashboard-thinking">Thinking...</span>}
                        </div>
                    </div>

                    {chatError && (
                        <div className="dashboard-error" role="alert">
                            {chatError}
                        </div>
                    )}

                    <div className="dashboard-messages">
                        {messages.length === 0 ? (
                            <div className="dashboard-empty-state">
                                <h3>Start a conversation</h3>
                                <p>
                                    Upload a PDF, wait until it is ready, select it from the library, then ask a question.
                                </p>
                            </div>
                        ) : (
                            messages.map((m) => (
                                <div
                                    key={m.id}
                                    className={`dashboard-message-row from-${m.role}`}
                                >
                                    <div className="dashboard-message-bubble">
                                        <div className="dashboard-message-content">{m.content}</div>
                                        <div className="dashboard-message-time">
                                            {new Date(m.timestamp).toLocaleTimeString()}
                                        </div>

                                        {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                                            <div className="dashboard-citations">
                                                {m.citations.map((c, idx) => (
                                                    <button
                                                        key={`${c.label}-${idx}`}
                                                        onClick={() => {
                                                            const p = c.pageNumber;
                                                            setTargetPdfPage(null);
                                                            setTimeout(() => setTargetPdfPage(p), 0);
                                                        }}
                                                        className="dashboard-citation"
                                                        title={c.preview || ''}
                                                    >
                                                        {c.label} · Page {c.pageNumber}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="dashboard-input-bar">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={
                                selectedDoc?.status === 'READY'
                                    ? 'Ask a question about this PDF...'
                                    : 'Select a ready document first...'
                            }
                            className="dashboard-chat-input"
                            disabled={sending || !selectedDocumentId || selectedDoc?.status !== 'READY'}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') sendMessage();
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            className="dashboard-button dashboard-button-primary"
                            disabled={sending || !selectedDocumentId || selectedDoc?.status !== 'READY'}
                        >
                            Send
                        </button>
                    </div>
                </section>

                <section className="dashboard-panel dashboard-pdf-panel">
                    <div className="dashboard-panel-header">
                        <div>
                            <p className="dashboard-kicker">Preview</p>
                            <h2>Document</h2>
                        </div>

                        {pdfBaseUrl && (
                            <a
                                href={pdfBaseUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="dashboard-button dashboard-button-secondary"
                            >
                                Open
                            </a>
                        )}
                    </div>

                    {pdfBaseUrl ? (
                        <PdfViewer
                            fileUrl={pdfBaseUrl}
                            targetPage={targetPdfPage}
                            freezeResize={pdfResizePaused}
                            resizeVersion={pdfResizeVersion}
                        />
                    ) : (
                        <div className="dashboard-pdf-empty">Select a PDF to preview</div>
                    )}
                </section>
            </main>
        </div>
    );
}
