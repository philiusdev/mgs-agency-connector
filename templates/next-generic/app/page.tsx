import Link from "next/link";

import { AgencyCredit } from "@/components/agency/AgencyCredit";
import { chargerModeleSite, normaliserNomSite } from "@/lib/site-starters";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const modele = chargerModeleSite(process.env.MGS_SITE_TYPE);
  const nomSite = normaliserNomSite(process.env.MGS_SITE_NAME);

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link href="/" className="site-brand">{nomSite}</Link>
        <nav className="site-nav" aria-label="Navigation principale">
          <a href="#presentation">Présentation</a>
          <a href="#offre">Découvrir</a>
          <Link href="/connexion">Administration</Link>
        </nav>
      </header>
      <section className="site-hero" id="presentation">
        <div className="site-hero-copy">
          <p className="site-kicker">{modele.accroche}</p>
          <h1>{modele.titre}</h1>
          <p className="site-description">{modele.description}</p>
          <a className="site-button" href="#offre">Découvrir le modèle</a>
        </div>
        <aside className="site-preview" aria-label={`Aperçu du modèle ${modele.libelle}`}>
          <span className="site-preview-label">{modele.libelle}</span>
          <strong>{nomSite}</strong>
          <span className="site-preview-line" />
          <span className="site-preview-line site-preview-line--short" />
          <span className="site-preview-pill">Modèle à personnaliser</span>
        </aside>
      </section>
      <section className="site-offer" id="offre">
        <div className="site-section-heading">
          <p className="site-kicker">Votre projet</p>
          <h2>{modele.sectionTitre}</h2>
          <p>{modele.sectionDescription}</p>
        </div>
        <div className="site-card-grid">
          {modele.elements.map((element, index) => (
            <article className="site-card" key={element.titre}>
              <span className="site-card-number">0{index + 1}</span>
              <h3>{element.titre}</h3>
              <p>{element.description}</p>
            </article>
          ))}
        </div>
        <p className="site-note">{modele.note}</p>
      </section>
      <section className="site-contact" id="contact">
        <div>
          <p className="site-kicker">Prochaine étape</p>
          <h2>Personnalisez ce modèle pour votre activité.</h2>
        </div>
        <Link className="site-button site-button--light" href="/connexion">
          Accès administrateur
        </Link>
      </section>
      <footer className="site-footer">
        <span>{nomSite}</span>
        <AgencyCredit />
      </footer>
    </main>
  );
}
