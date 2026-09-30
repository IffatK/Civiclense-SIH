import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import GovShell, { GovField } from "../gov/GovShell.jsx";
import { ErrorNote } from "../../components/Primitives.jsx";
import { api } from "../../lib/api.js";

/**
 * The way in for universities and companies.
 *
 * Its own door, like /gov for municipal staff. Before this an institution had
 * to register as a resident and then find an "apply" link inside the citizen
 * sidebar — which asked a university to pretend to be a citizen first, and put
 * the entry point exactly where nobody from a university would look.
 *
 * Reuses the portal shell rather than inventing a third one. Two visually
 * different sign-in pages for two kinds of organisation would be a distinction
 * without a difference.
 */
export default function CampusLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    // Fetch the current profile after sign-in. Approval changes the database
    // role, not the JWT claim, so relying on a prior tab's profile required a
    // needless sign-out cycle.
    try {
      const { profile } = await api.me();
      navigate(profile?.institution_id && profile?.institution_approved ? "/campus/dashboard" : "/campus/status", { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <GovShell
      surface="campus"
      badge="Campus portal"
      title="Campus sign in"
      sub="For faculty, students and industry partners working on community challenges."
      points={[
        { title: "Challenges come from real reports",
          body: "Each one was raised from a group of complaints residents filed repeatedly." },
        { title: "You are matched on what you can do",
          body: "Ranked by how much of a challenge your expertise covers, with the gaps shown." },
        { title: "You quote, the city chooses",
          body: "Cost, duration and deliverables — compared against everyone else who bid." },
      ]}
      footer={
        <>
          New institution? <Link to="/campus/register" className="link">Register yours</Link>
          <br />
          <span className="label">
            Residents sign in <Link to="/signin" className="link">here</Link> · municipal staff use{" "}
            <Link to="/gov" className="link">the staff portal</Link>
          </span>
        </>
      }
    >
      <form onSubmit={submit} className="stack-4">
        <GovField label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
        <GovField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </GovShell>
  );
}
