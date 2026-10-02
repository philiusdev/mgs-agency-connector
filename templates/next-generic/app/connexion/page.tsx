import Link from "next/link";

import { ConnexionForm } from "./form";

export default function ConnexionPage() {
  return (
    <main className="site-auth">
      <h1>Connexion administrateur</h1>
      <p>Un code de connexion sera envoyé à l’adresse e-mail administratrice.</p>
      <ConnexionForm />
      <p><Link href="/">← Retour au site</Link></p>
    </main>
  );
}
