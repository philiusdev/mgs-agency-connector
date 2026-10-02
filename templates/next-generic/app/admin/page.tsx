import { redirect } from "next/navigation";

import { AgencyPanel } from "@/components/agency/AgencyPanel";
import { lireSessionAdmin } from "@/app/api/agency/_interne/securite";
import { loadAgencySpace } from "@/lib/agency/space";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await lireSessionAdmin();
  if (!session.ok) redirect("/connexion");
  const space = await loadAgencySpace();
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="site-brand" href="/">Administration du site</a>
        <form action="/api/deconnexion" method="post"><button type="submit">Se déconnecter</button></form>
      </header>
      <div className="site-hero">
        <h1>Bonjour {session.session.nom ?? session.session.email ?? ""}</h1>
        <AgencyPanel space={space} requesterName={session.session.nom ?? undefined} requesterEmail={session.session.email ?? undefined} />
      </div>
    </main>
  );
}
