"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function ConnexionForm({ platformUrl, siteId }: { platformUrl: string; siteId: string }) {
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
    if (!platformUrl || !/^[0-9a-f-]{36}$/i.test(siteId)) {
      setMessage("Le relais sécurisé d’authentification n’est pas configuré pour ce site.");
      setEnvoi(false);
      return;
    }
    const supabase = createBrowserClient(url, key);
    try {
      const callback = new URL("/auth/site-callback", platformUrl);
      callback.searchParams.set("site_id", siteId);
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        "auth-email-start",
        {
          body: {
            brand: "mgs",
            siteId,
            email: email.trim().toLowerCase(),
            emailRedirectTo: callback.toString(),
          },
        },
      );
      if (error) {
        const context = error.context;
        const result = context instanceof Response
          ? await context.clone().json().catch(() => null) as { error?: string } | null
          : null;
        throw new Error(result?.error ?? "Impossible d’envoyer le message.");
      }
      if (!data?.ok) throw new Error(data?.error ?? "Impossible d’envoyer le message.");
      setEtape("code");
      setMessage("Un code à usage unique et un lien de connexion ont été envoyés par e-mail.");
    } catch (error) {
      console.error("[site-auth] Echec de demande de connexion.", error);
      setMessage(error instanceof Error ? error.message : "Connexion impossible. Vérifiez que l’adresse a été invitée comme administratrice.");
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
        type: "magiclink",
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
