import Link from "next/link";

import { AgencyCredit } from "@/components/agency/AgencyCredit";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <Link href="/" className="site-brand">Nouveau site</Link>
        <Link href="/connexion">Administration</Link>
      </header>
      <section className="site-hero">
        <p className="site-kicker">Votre présence en ligne</p>
        <h1>Un site prêt à grandir avec votre activité.</h1>
        <p>Cette base de site est personnalisable. Remplacez ces contenus par votre identité et vos services.</p>
        <Link className="site-button" href="/connexion">Accès administrateur</Link>
      </section>
      <AgencyCredit />
    </main>
  );
}
