import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchMe, logoutApi, listMyDocuments, chatAsk, getDocumentViewUrl } from '../api';
import { clearAuth } from '../auth';
import { useNavigate } from 'react-router-dom';
import PdfUploader from '../components/PdfUploader';
import logo from '../assets/Logo2.png'
import title from '../assets/Title.png'

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
    createdAt : string;
};

export default function Dashboard() {
    const navigate = useNavigate();
    const [me, setMe] = useState<any>(null);

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
    const [pdfPage, setPdfPage] = useState<number | null>(null);

    const chatByDocRef = useRef(chatByDoc);
    const sessionByDocRef = useRef(sessionByDoc);

    useEffect(() => { chatByDocRef.current = chatByDoc; }, [chatByDoc]);
    useEffect(() => { sessionByDocRef.current = sessionByDoc; }, [sessionByDoc]);

    const selectedDoc = useMemo(
        () => docs.find((d) => d.id === selectedDocumentId) ?? null,
        [docs, selectedDocumentId]
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

            //Auto select the first document
            if (!selectedDocumentId) {
                const firstReady = docsList.find((d: DocItem) => d.status === 'READY');
                if(firstReady) {
                    await selectDoc(firstReady.id);
                }
            }
        } catch (e) {
            console.error('Failed to load documents:', e)
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
    }

    const selectDoc = async (docId: string) => {
        // Save current doc chat before switching
        if (selectedDocumentId) {
            setChatByDoc(prev => ({ ...prev, [selectedDocumentId]: messages }));
            setSessionByDoc(prev => ({ ...prev, [selectedDocumentId]: sessionId }));
        }

        // Switch doc
        setSelectedDocumentId(docId);

        // Restore chat for the new doc (if any)
        setMessages(chatByDocRef.current[docId] ?? []);
        setSessionId(sessionByDocRef.current[docId] ?? null);

        setChatError(null);
        setInput('');
        setPdfPage(null);

        try {
            const { url } = await getDocumentViewUrl(docId);
            setPdfBaseUrl(url);
        } catch (e) {
            setPdfBaseUrl(null);
        }
    }


    const sendMessage = async () => {
        const text =input.trim();
        if (!text) return;

        if (!selectedDocumentId) {
            setChatError('Select a document first');
            return;
        }

        if (selectedDoc?.status !== 'READY') {
            setChatError('That document is not READY yet. Please wait for processing');
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

    return (
        <div style={styles.page}>
            {/* Top bar */}
            <header style={styles.topBar}>
                <div>
                    <div>
                        <img src={logo} style={styles.logo}></img>
                        <img src={title} style={styles.title}></img>
                    </div>
                    <div style={styles.subTitle}>
                        {me ? `Logged in as ${me.userId}${me.name ? ` (${me.name})` : ''}` : 'Loading…'}
                    </div>
                </div>

                <button onClick={logout} style={styles.logoutBtn}>
                    Logout
                </button>
            </header>

            {/* Main layout */}
            <div style={styles.main}>
                {/* Sidebar */}
                <aside style={styles.sidebar}>
                    <div style={styles.sidebarHeader}>Chats</div>

                    <button style={styles.newChatBtn} onClick={startNewChat}>
                        Clear Chat
                    </button>

                    <div style={{ marginTop: 10 }}>
                        <PdfUploader onUploaded={reloadDocs} />
                    </div>

                    <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13 }}>My PDFs</div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                        {docs.length === 0 ? (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>No documents yet.</div>
                        ) : (
                            docs.map((d) => {
                                const isSelected = d.id === selectedDocumentId;
                                const isReady = d.status === 'READY';

                                return (
                                    <button
                                        key={d.id}
                                        onClick={() => selectDoc(d.id)}
                                        style={{
                                            textAlign: 'left',
                                            border: isSelected ? '2px solid rgba(0,0,0,0.25)' : '1px solid rgba(0,0,0,0.08)',
                                            borderRadius: 10,
                                            padding: 10,
                                            background: isSelected ? '#f1f5ff' : '#fff',
                                            cursor: 'pointer',
                                        }}
                                        title={isReady ? 'Ready' : 'Processing'}
                                    >
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{d.originalFileName}</div>
                                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                                            {d.status}
                                            {d.pageCount ? ` • ${d.pageCount} pages` : ''}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Chat area */}
                <section style={styles.chatArea}>
                    <div style={styles.chatHeader}>
                        <div>
                            <div style={{ fontWeight: 700 }}>AI Chat</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                {selectedDoc
                                    ? `Using: ${selectedDoc.originalFileName} (${selectedDoc.status})`
                                    : 'Select a PDF to start'}
                            </div>
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {sending ? 'Thinking…' : ''}
                        </div>
                    </div>

                    {chatError && (
                        <div style={{ padding: 12, color: 'crimson', fontSize: 12 }}>
                            {chatError}
                        </div>
                    )}

                    {/* Messages */}
                    <div style={styles.messages}>
                        {messages.length === 0 ? (
                            <div style={styles.emptyState}>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>Start a conversation</div>
                                <div style={{ opacity: 0.8, marginTop: 6 }}>
                                    Upload a PDF, wait until it’s <b>READY</b>, select it on the left, then ask questions.
                                </div>
                            </div>
                        ) : (
                            messages.map((m) => (
                                <div
                                    key={m.id}
                                    style={{
                                        ...styles.messageRow,
                                        justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                                    }}
                                >
                                    <div
                                        style={{
                                            ...styles.bubble,
                                            ...(m.role === 'user' ? styles.userBubble : styles.aiBubble),
                                        }}
                                    >
                                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                                        <div style={styles.time}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                                        {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                                            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {m.citations.map((c, idx) => (
                                                    <button
                                                        key={`${c.label}-${idx}`}
                                                        onClick={() => {
                                                            setPdfPage(c.pageNumber);
                                                            setTimeout(() => setPdfPage(c.pageNumber), 0);
                                                        }}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: 12,
                                                            borderRadius: 8,
                                                            border: '1px solid rgba(0,0,0,0.15)',
                                                            background: '#fff',
                                                            cursor: 'pointer',
                                                        }}
                                                        title={c.preview || ''}
                                                    >
                                                        {c.label} • Page {c.pageNumber}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Input */}
                    <div style={styles.inputBar}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={
                                selectedDoc?.status === 'READY'
                                    ? 'Type a message…'
                                    : 'Select a READY document first…'
                            }
                            style={styles.input}
                            disabled={sending || !selectedDocumentId || selectedDoc?.status !== 'READY'}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') sendMessage();
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            style={styles.sendBtn}
                            disabled={sending || !selectedDocumentId || selectedDoc?.status !== 'READY'}
                        >
                            Send
                        </button>
                    </div>
                </section>

                <section style={styles.pdfArea}>
                    <div style={styles.pdfHeader}>
                        <div style={{ fontWeight: 700 }}>Document</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {pdfBaseUrl && (
                                <a
                                    href={pdfBaseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={styles.openLink}
                                >
                                    Open
                                </a>
                            )}
                        </div>
                    </div>

                    {pdfBaseUrl ? (
                        <iframe
                            key={`${selectedDocumentId}-${pdfPage ?? 0}`}
                            title="PDF Viewer"
                            src={pdfPage ? `${pdfBaseUrl}#page=${pdfPage}` : pdfBaseUrl}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                    ) : (
                        <div style={styles.pdfEmpty}>Select a PDF to preview</div>
                    )}
                </section>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f6fa',
        fontFamily: 'Arial, sans-serif',
    },
    topBar: {
        padding: '14px 18px',
        background: '#ffffff',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    logo: {
        width: 40
    },
    title: {
        width: 90,
        paddingLeft: 5
    },
    subTitle: { fontSize: 12, opacity: 0.7, marginTop: 2 },
    logoutBtn: {
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.15)',
        background: '#fff',
        cursor: 'pointer',
    },
    main: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '280px 1fr 1fr',
        gap: 12,
        padding: 12,
        minHeight: 0,
    },
    sidebar: {
        background: '#fff',
        borderRadius: 12,
        padding: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 0,
    },
    sidebarHeader: { fontWeight: 700, fontSize: 14 },
    newChatBtn: {
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        fontWeight: 600,
    },
    chatArea: {
        background: '#fff',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
    },
    chatHeader: {
        padding: '12px 14px',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },
    messages: {
        flex: 1,
        padding: 14,
        overflowY: 'auto',
    },
    emptyState: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: 20,
        opacity: 0.9,
    },
    messageRow: {
        display: 'flex',
        marginBottom: 10,
    },
    bubble: {
        maxWidth: '70%',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        fontSize: 14,
    },
    userBubble: { background: '#eef2ff' },
    aiBubble: { background: '#f7f7f7' },
    time: { fontSize: 11, opacity: 0.6, marginTop: 6, textAlign: 'right' },
    inputBar: {
        padding: 12,
        borderTop: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        gap: 10,
    },
    input: {
        flex: 1,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.15)',
        fontSize: 14,
        outline: 'none',
    },
    sendBtn: {
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.15)',
        background: '#fff',
        cursor: 'pointer',
        fontWeight: 600,
    },
    pdfArea: {
        background: '#fff',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
    },
    pdfHeader: {
        padding: '12px 14px',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    openLink: {
        fontSize: 12,
        textDecoration: 'none',
        padding: '6px 10px',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 8,
        color: '#111',
    },
    pdfEmpty: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.65,
        fontSize: 13,
    },
};