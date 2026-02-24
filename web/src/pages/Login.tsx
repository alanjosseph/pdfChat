import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from '../auth';
import logo from '../assets/Logo1.png'

type LoginResponse = {
    token: string;
    user: { id: string; userId: string; name?: string | null };
};

export default function Login() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch("api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: username, password }),
            });
            console.log("Login response status:", res);

            if (!res.ok) {
                const msg = (await res.json().catch(() => null))?.message;
                throw new Error (Array.isArray(msg) ? msg.join(", ") : msg || "Login failed");
            }

            const data = (await res.json()) as LoginResponse;
            setAuth(data.token, data.user);

            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message || "An error occurred during login.");
            setLoading(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style ={styles.container}>
            <form onSubmit={handleSubmit} style={styles.form}>
                <img src={logo} style={styles.image}></img>

                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={styles.input}
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={styles.input}
                />

                {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}

                <button type="submit" style={styles.button} disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>

                <text style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                    For demo username and password click on the link <a href="https://github.com/alanjosseph/pdfChat/blob/develop/Readme.md" target="_blank">GitHub</a>
                </text>

                
            </form>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        background: '#f5f6fa',
    },
    heading:{
        color: '#000000ff',
        paddingTop: 0,
        marginTop: 0,
        paddingBottom: 10,
        marginBottom: 5,
    },
    image: {
        width: 200,
        marginLeft: 60,
    },
    form: {
        width: 320,
        padding: 24,
        background: '#ffffffff',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'Arial, sans-serif',
    },
    input: {
        padding: 10,
        fontSize: 14,
        borderRadius: 6
    },
    button: {
        padding: 10,
        fontSize: 15,
        cursor: 'pointer',
    },
};