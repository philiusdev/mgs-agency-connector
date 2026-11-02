import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { ConfigurationMobile } from "../lib/configuration";
import { chargerConfiguration } from "../lib/configuration";
import { creerClientSupabase } from "../lib/supabase";
import { AuthProvider } from "../context/auth";

export default function RootLayout() {
  const [config, setConfig] = useState<ConfigurationMobile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void chargerConfiguration()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Configuration indisponible.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Connexion impossible</Text>
        <Text style={styles.message}>{error}</Text>
      </View>
    );
  }
  if (!config) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.message}>Connexion au site…</Text>
      </View>
    );
  }

  return (
    <AuthProvider
      client={creerClientSupabase(config)}
      websiteUrl={config.websiteUrl}
      platformUrl={config.platformUrl}
      siteId={config.siteId}
    >
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#f4f7fb" } }} />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  title: { color: "#142238", fontSize: 22, fontWeight: "700" },
  message: { color: "#53657d", fontSize: 15, textAlign: "center" },
});
