import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../context/auth";

export default function LoginScreen() {
  const { client, loading, platformUrl, session, siteId } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, router, session]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const callback = new URL("/auth/site-callback", platformUrl);
      callback.searchParams.set("site_id", siteId);
      const { data, error: functionError } = await client.functions.invoke<{
        ok?: boolean;
        error?: string;
        delivery?: string;
      }>("auth-email-start", {
        body: {
          brand: "mgs",
          siteId,
          email: email.trim().toLowerCase(),
          emailRedirectTo: callback.toString(),
          clientSendsEmail: true,
        },
      });
      if (functionError) {
        const context = functionError.context;
        const result = context instanceof Response
          ? await context.clone().json().catch(() => null) as { error?: string } | null
          : null;
        throw new Error(result?.error ?? "Impossible d’envoyer le code de connexion.");
      }
      if (!data?.ok) throw new Error(data?.error ?? "Impossible d’envoyer le code de connexion.");

      if (data.delivery === "supabase_auth_smtp") {
        const { error: sendError } = await client.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
        });
        if (sendError) throw sendError;
      } else if (data.delivery !== undefined) {
        throw new Error("Le service de connexion a renvoyé une réponse inattendue.");
      }
      setStep("code");
      setNotice("Un code de connexion a été envoyé par e-mail.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le code de connexion n’a pas pu être envoyé.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = { email: email.trim().toLowerCase(), token: code.trim() };
      let verification = await client.auth.verifyOtp({ ...payload, type: "email" });
      if (verification.error) {
        verification = await client.auth.verifyOtp({ ...payload, type: "magiclink" });
      }
      if (verification.error) throw verification.error;
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Code invalide ou expiré. Vérifiez-le et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#ad542b" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>MGS · CENTRE CLIENT</Text>
      <Text style={styles.title}>Connexion</Text>
      <Text style={styles.subtitle}>Recevez un code sécurisé sur l’adresse e-mail invitée.</Text>
      <TextInput
        accessibilityLabel="Adresse e-mail"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Adresse e-mail"
        style={styles.input}
        value={email}
      />
      {step === "code" ? (
        <TextInput
          accessibilityLabel="Code de connexion"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          maxLength={8}
          onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
          placeholder="Code reçu par e-mail"
          style={styles.input}
          value={code}
        />
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !email.trim() || (step === "code" && code.length < 6)}
        onPress={() => void (step === "email" ? requestCode() : verifyCode())}
        style={[styles.button, (busy || !email.trim() || (step === "code" && code.length < 6)) && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>
          {busy ? "Vérification…" : step === "email" ? "Recevoir mon code" : "Vérifier le code"}
        </Text>
      </Pressable>
      {step === "code" ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setStep("email");
            setCode("");
            setNotice(null);
            setError(null);
          }}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>Changer d’adresse e-mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 26, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#ad542b", fontSize: 12, fontWeight: "700", letterSpacing: 1.1 },
  title: { color: "#302d2a", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#68615b", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  input: { borderRadius: 12, backgroundColor: "#fffefa", borderWidth: 1, borderColor: "#ded9d1", padding: 15, color: "#302d2a" },
  error: { borderRadius: 12, backgroundColor: "#fff0f0", color: "#a83232", padding: 14 },
  notice: { borderRadius: 12, backgroundColor: "#eaf7ed", color: "#1d6631", padding: 14 },
  button: { alignItems: "center", borderRadius: 12, backgroundColor: "#a84d24", padding: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  linkButton: { alignItems: "center", padding: 12 },
  linkText: { color: "#a84d24", fontSize: 14, fontWeight: "600" },
});
