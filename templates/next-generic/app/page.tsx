import Link from "next/link";

import { AgencyCredit } from "@/components/agency/AgencyCredit";
import { chargerModeleSite, normaliserNomSite } from "@/lib/site-starters";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const modele = chargerModeleSite(process.env.MGS_SITE_TYPE);
  const nomSite = normaliserNomSite(process.env.MGS_SITE_NAME);

  return (
    <main className="site-shell">
      <a className="site-skip-link" href="#contenu">Aller au contenu</a>
      <header className="site-header">
        <Link href="/" className="site-brand" aria-label={`${nomSite}, accueil`}>
          <span className="site-brand-mark" aria-hidden="true">✳</span>
          {nomSite}
        </Link>
        <nav className="site-nav" aria-label="Navigation principale">
          <a href="#offre">Découvrir</a>
          <a href="#etapes">Personnalisation</a>
          <Link className="site-nav-admin" href="/connexion">Administration <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <div id="contenu">
        <section className="site-hero" aria-labelledby="titre-principal">
          <div className="site-hero-copy">
            <p className="site-kicker"><span className="site-kicker-dot" />{modele.accroche}</p>
            <h1 id="titre-principal">{modele.titre}</h1>
            <p className="site-description">{modele.description}</p>
            <div className="site-hero-actions">
              <a className="site-button" href="#offre">Explorer le modèle <span aria-hidden="true">↓</span></a>
              <span className="site-action-note">Une base claire, à votre image.</span>
            </div>
            <div className="site-hero-meta">
              <span className="site-meta-mark" aria-hidden="true">✦</span>
              <span><strong>{modele.libelle}</strong><br />Modèle de départ à personnaliser</span>
            </div>
          </div>
          <aside className="site-preview" aria-label={`Aperçu graphique du modèle ${modele.libelle}`}>
            <div className="site-preview-top">
              <span className="site-preview-brand"><span aria-hidden="true">✳</span>{nomSite}</span>
              <span className="site-preview-menu" aria-hidden="true"><i /><i /></span>
            </div>
            <div className="site-preview-art" aria-hidden="true">
              <span className="site-art-orbit site-art-orbit--one" />
              <span className="site-art-orbit site-art-orbit--two" />
              <span className="site-art-sun" />
              <span className="site-art-leaf site-art-leaf--one" />
              <span className="site-art-leaf site-art-leaf--two" />
              <span className="site-art-caption">Un espace<br />pour vos idées</span>
            </div>
            <div className="site-preview-content">
              <span className="site-preview-label">{modele.libelle}</span>
              <strong>{nomSite}</strong>
              <span className="site-preview-line" />
              <span className="site-preview-line site-preview-line--short" />
              <span className="site-preview-pill"><span aria-hidden="true">✦</span> À personnaliser</span>
            </div>
            <span className="site-preview-index" aria-hidden="true">01 / 04</span>
          </aside>
        </section>

        <section className="site-offer" id="offre" aria-labelledby="titre-offre">
          <div className="site-section-heading">
            <div>
              <p className="site-kicker">Le point de départ</p>
              <h2 id="titre-offre">{modele.sectionTitre}</h2>
            </div>
            <p>{modele.sectionDescription}</p>
          </div>
          <div className="site-card-grid">
            {modele.elements.map((element, index) => (
              <article className="site-card" key={element.titre}>
                <span className="site-card-top">
                  <span className="site-card-number">0{index + 1}</span>
                  <span className="site-card-arrow" aria-hidden="true">↗</span>
                </span>
                <h3>{element.titre}</h3>
                <p>{element.description}</p>
              </article>
            ))}
          </div>
          <p className="site-note"><span aria-hidden="true">✳</span>{modele.note}</p>
        </section>

        <section className="site-steps" id="etapes" aria-labelledby="titre-etapes">
          <div className="site-steps-intro">
            <p className="site-kicker">La suite, en toute simplicité</p>
            <h2 id="titre-etapes">De cette base à votre univers.</h2>
            <p>Les contenus affichés sont des repères. Remplacez-les par les informations réelles de votre activité avant publication.</p>
          </div>
          <ol className="site-step-list">
            <li><span>01</span><div><h3>Posez vos repères</h3><p>Choisissez les mots, les couleurs et les priorités qui racontent votre projet.</p></div></li>
            <li><span>02</span><div><h3>Ajoutez vos contenus</h3><p>Intégrez vos textes, vos images autorisées et les informations vérifiées.</p></div></li>
            <li><span>03</span><div><h3>Vérifiez avant lancement</h3><p>Testez les liens et confirmez que chaque parcours correspond à vos services réels.</p></div></li>
          </ol>
        </section>
      </div>

      <section className="site-contact" aria-labelledby="titre-contact">
        <div>
          <p className="site-kicker">Votre prochaine étape</p>
          <h2 id="titre-contact">Faites-en un site qui vous ressemble.</h2>
          <p>Retrouvez l’espace d’administration pour poursuivre la personnalisation.</p>
        </div>
        <Link className="site-button site-button--light" href="/connexion">
          Accéder à l’administration <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <footer className="site-footer">
        <span className="site-footer-brand">{nomSite}</span>
        <span className="site-footer-note">Un modèle de départ, votre histoire à écrire.</span>
        <AgencyCredit />
      </footer>
    </main>
  );
}
