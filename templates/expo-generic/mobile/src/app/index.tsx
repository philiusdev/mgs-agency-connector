import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../context/auth";

type AgencyData = {
  agence?: { identite?: { nom?: string } };
  prestations?: unknown[];
  offres?: unknown[];
  abonnement?: { plan?: { nom?: string }; statut?: string } | null;
  demandes?: unknown[];
};

function asAgencyData(value: unknown): AgencyData | null {
  if (!value || typeof value !== "object") return null;
  return value as AgencyData;
}

async function chargerAgence(websiteUrl: string, token: string): Promise<AgencyData> {
  const response = await fetch(`${websiteUrl}/api/mobile/agency`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const detail = result && typeof result === "object" && "error" in result
      ? String(result.error)
      : "Le connecteur MGS ne peut pas répondre.";
    throw new Error(detail);
  }
  const data = asAgencyData(result);
  if (!data) throw new Error("La réponse du connecteur MGS est invalide.");
  return data;
}

export default function HomeScreen() {
  const { client, session, loading, websiteUrl } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AgencyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const token = session?.access_token;

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void chargerAgence(websiteUrl, token)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Les données du site sont indisponibles.");
      });
    return () => {
      active = false;
    };
  }, [token, websiteUrl]);

  function actualiserDonnees() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    void chargerAgence(websiteUrl, token)
      .then(setData)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Les données du site sont indisponibles.");
      })
      .finally(() => setRefreshing(false));
  }

  if (loading || !session) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const agencyName = data?.agence?.identite?.nom || "Votre espace client";
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MGS · CENTRE CLIENT</Text>
        <Text style={styles.title}>{agencyName}</Text>
        <Text style={styles.email}>{session.user.email}</Text>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.grid}>
        <Stat label="Prestations" value={data?.prestations?.length} />
        <Stat label="Offres" value={data?.offres?.length} />
        <Stat label="Demandes" value={data?.demandes?.length} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connecteur d’agence</Text>
        <Text style={styles.cardText}>
          {data
            ? "Le site communique avec la plateforme MGS. Les clés de connexion restent sur le serveur."
            : "Les données du site apparaîtront ici après la première synchronisation."}
        </Text>
      </View>

      <Pressable accessibilityRole="button" onPress={actualiserDonnees} style={styles.button} disabled={refreshing}>
        <Text style={styles.buttonText}>{refreshing ? "Actualisation…" : "Actualiser les données"}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          const { error: signOutError } = await client.auth.signOut();
          if (signOutError) setError("La déconnexion n’a pas abouti. Réessayez.");
          else router.replace("/login");
        }}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Se déconnecter</Text>
      </Pressable>
      <Text style={styles.footer}>Application de départ · personnalisez les écrans avant de la publier.</Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{typeof value === "number" ? value : "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { gap: 8, marginBottom: 8 },
  eyebrow: { color: "#2563eb", fontSize: 12, fontWeight: "700", letterSpacing: 1.1 },
  title: { color: "#142238", fontSize: 28, fontWeight: "800" },
  email: { color: "#53657d", fontSize: 14 },
  grid: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 16, backgroundColor: "#fff", padding: 16, gap: 7 },
  statValue: { color: "#142238", fontSize: 23, fontWeight: "800" },
  statLabel: { color: "#53657d", fontSize: 12 },
  card: { borderRadius: 16, backgroundColor: "#fff", padding: 18, gap: 8 },
  cardTitle: { color: "#142238", fontSize: 16, fontWeight: "700" },
  cardText: { color: "#53657d", fontSize: 14, lineHeight: 21 },
  error: { borderRadius: 12, backgroundColor: "#fff0f0", color: "#a83232", padding: 14 },
  button: { alignItems: "center", borderRadius: 12, backgroundColor: "#2563eb", padding: 15 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#d7e0ec", padding: 15 },
  secondaryButtonText: { color: "#253955", fontSize: 15, fontWeight: "600" },
  footer: { color: "#738198", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
});
