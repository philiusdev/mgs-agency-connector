import Link from "next/link";

import { ConnexionForm } from "./form";

export default function ConnexionPage() {
  return (
    <main className="site-auth">
      <h1>Connexion administrateur</h1>
      <p>Un code de connexion sera envoyé à l’adresse e-mail administratrice.</p>
      <ConnexionForm
        platformUrl={process.env.MGS_PLATFORM_URL ?? ""}
        siteId={process.env.MGS_SITE_ID ?? ""}
      />
      <p><Link href="/">← Retour au site</Link></p>
    </main>
  );
}
