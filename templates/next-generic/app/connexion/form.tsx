"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function ConnexionForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [etape, setEtape] = useState<"email" | "code">("email");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnvoi(true);
    setMessage("");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage("La connexion n’est pas encore configurée.");
      setEnvoi(false);
      return;
    }
    const supabase = createBrowserClient(url, key);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?next=%2Fadmin`,
        },
      });
      if (error) throw error;
      setEtape("code");
      setMessage("Un code à usage unique et un lien de connexion ont été envoyés par e-mail.");
    } catch (error) {
      console.error("[site-auth] Echec de demande de connexion.", error);
      setMessage("Connexion impossible. Vérifiez que l’adresse a été invitée comme administratrice.");
    } finally {
      setEnvoi(false);
    }
  }

  async function verifierCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnvoi(true);
    setMessage("");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage("La connexion n’est pas encore configurée.");
      setEnvoi(false);
      return;
    }
    try {
      const supabase = createBrowserClient(url, key);
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      window.location.assign("/admin");
    } catch (error) {
      console.error("[site-auth] Verification OTP refusee.", error);
      setMessage("Code invalide ou expiré. Vérifiez-le et réessayez.");
      setEnvoi(false);
    }
  }

  return (
    <>
      {etape === "email" ? (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="admin-email">Adresse e-mail</label>
          <input id="admin-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <button type="submit" disabled={envoi}>{envoi ? "Envoi…" : "Recevoir mon code ou lien"}</button>
        </form>
      ) : (
        <form onSubmit={(event) => void verifierCode(event)}>
          <label htmlFor="admin-code">Code reçu par e-mail</label>
          <input id="admin-code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          <button type="submit" disabled={envoi}>{envoi ? "Vérification…" : "Vérifier le code"}</button>
          <button type="button" disabled={envoi} onClick={() => { setEtape("email"); setMessage(""); setCode(""); }}>Changer d’adresse</button>
        </form>
      )}
      {message ? <p className="site-message" role="status">{message}</p> : null}
    </>
  );
}
