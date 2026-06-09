import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from "../../auth";
import logo from "../../assets/Logo3.png";
import "./login.css";

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

            if (!res.ok) {
                const msg = (await res.json().catch(() => null))?.message;
                throw new Error(
                    Array.isArray(msg) ? msg.join(", ") : msg || "Login failed"
                );
            }

            const data = (await res.json()) as LoginResponse;
            setAuth(data.token, data.user);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message || "An error occurred during login.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page">
            <section className="login-panel" aria-label="Login">
                <div className="login-hero" aria-hidden="true">
                    <div className="login-hero-copy">
                        <p className="login-eyebrow">Document AI</p>
                        <h2>Ask better questions of every PDF.</h2>
                    </div>
                    <div className="login-preview">
                        <div className="login-preview-line is-wide" />
                        <div className="login-preview-line" />
                        <div className="login-preview-bubble">
                            Summarize this contract and cite the risky clauses.
                        </div>
                        <div className="login-preview-answer">
                            Found 3 clauses to review across pages 2, 8, and 14.
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="login-card">
                    <img src={logo} alt="pdfChat logo" className="login-logo" />

                    <div className="login-copy">
                        <h1>Welcome back</h1>
                        <p>Sign in to chat with your PDFs using AI.</p>
                    </div>

                    <label className="login-field">
                        <span>Username</span>
                        <div className="login-input-wrap">
                            <input
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                                className="login-input"
                            />
                        </div>
                    </label>

                    <label className="login-field">
                        <span>Password</span>
                        <div className="login-input-wrap">
                            <input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="login-input"
                            />
                        </div>
                    </label>

                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? "Signing in..." : "Sign in"}
                    </button>

                    <p className="login-note">
                        Demo credentials are listed in{" "}
                        <a
                            href="https://github.com/alanjosseph/pdfChat/blob/develop/Readme.md"
                            target="_blank"
                            rel="noreferrer"
                        >
                            GitHub
                        </a>
                    </p>
                </form>
            </section>
        </main>
    );
}
