import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { ErrorNote } from "../../components/Primitives.jsx";
import AuthShell, { Field } from "./AuthShell.jsx";
import GoogleButton, { OrDivider } from "../../components/GoogleButton.jsx";

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError("That email and password did not match an account.");
      setBusy(false);
      return;
    }

    /**
     * Where somebody goes after signing in.
     *
     * The page they were trying to reach, if a route guard sent them here.
     * Otherwise "/", which resolves the destination from the profile the
     * server returns.
     *
     * This used to read `user.user_metadata.role`. That field is whatever was
     * attached to the auth account at sign-up and is not the role the product
     * runs on — profiles.role is, and it is what every route guard checks.
     * An officer or a campus user whose metadata was never written fell
     * through to "citizen" and landed in the resident app, which then bounced
     * them somewhere else once the real profile loaded. Routing through "/"
     * waits for that profile and sends them once, correctly.
     */
    navigate(location.state?.from || "/", { replace: true });
  }

  return (
    <AuthShell
      title="Welcome back"
      sub="Log in to keep tracking your reports."
      footer={<>Don't have an account? <Link to="/register" className="link">Sign up</Link></>}
    >
      <GoogleButton label="Continue with Google" onError={setError} />
      <OrDivider />

      <form onSubmit={submit} className="stack-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" required />

        <div style={{ position: "relative" }}>
          <Field
            label="Password"
            type={show ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="btn--quiet"
            style={{ position: "absolute", right: 6, bottom: 6, padding: "6px 10px", fontSize: 13 }}
            onClick={() => setShow((v) => !v)}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
      </form>

      <p className="prose" style={{ fontSize: 13, marginTop: "var(--sp-4)" }}>
        Officer and administrator accounts are created by your department, not through this form.
      </p>
    </AuthShell>
  );
}
