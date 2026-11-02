export type TypeSiteModele = "boutique" | "vitrine" | "custom" | "application";

type ElementModele = {
  titre: string;
  description: string;
};

type ModeleSite = {
  libelle: string;
  accroche: string;
  titre: string;
  description: string;
  sectionTitre: string;
  sectionDescription: string;
  elements: readonly ElementModele[];
  note: string;
};

const MODELES_SITE: Record<TypeSiteModele, ModeleSite> = {
  boutique: {
    libelle: "Boutique e-commerce",
    accroche: "Boutique en ligne · modèle de départ",
    titre: "Une boutique claire, prête pour vos produits.",
    description:
      "Présentez votre marque et préparez votre catalogue. Les produits, les prix, le stock, le panier et le paiement restent à configurer avant toute vente.",
    sectionTitre: "Les bases de votre boutique",
    sectionDescription:
      "Une structure visuelle prête à recevoir vos vrais produits et vos règles de vente.",
    elements: [
      { titre: "Votre catalogue", description: "Ajoutez les produits, leurs photos, leurs prix et leur disponibilité." },
      { titre: "Vos collections", description: "Organisez les catégories et mettez en avant vos nouveautés." },
      { titre: "Vos commandes", description: "Configurez le panier, la livraison et le paiement avant l’ouverture." },
    ],
    note: "Aucun produit ni paiement réel n’est préconfiguré.",
  },
  vitrine: {
    libelle: "Site vitrine",
    accroche: "Site vitrine · modèle de départ",
    titre: "Votre savoir-faire mérite une belle vitrine.",
    description:
      "Présentez votre activité, vos services et vos réalisations dans une structure simple à personnaliser.",
    sectionTitre: "Une présentation qui vous ressemble",
    sectionDescription:
      "Remplacez ces exemples par votre histoire, vos prestations et vos coordonnées.",
    elements: [
      { titre: "Votre activité", description: "Expliquez clairement qui vous êtes et ce que vous proposez." },
      { titre: "Vos services", description: "Décrivez vos prestations avec des informations vérifiées." },
      { titre: "Vos réalisations", description: "Ajoutez des projets et des photos dont vous détenez les droits." },
    ],
    note: "Ajoutez vos coordonnées et vérifiez les formulaires avant publication.",
  },
  custom: {
    libelle: "Plateforme personnalisée",
    accroche: "Plateforme personnalisée · point de départ",
    titre: "Une base claire pour construire votre plateforme.",
    description:
      "Commencez par présenter votre service, puis développez les parcours et les outils adaptés à vos besoins réels.",
    sectionTitre: "Construisez votre expérience",
    sectionDescription:
      "Ces blocs sont des repères de conception, pas des fonctions métier déjà connectées.",
    elements: [
      { titre: "Vos espaces", description: "Définissez les profils et les informations accessibles à chacun." },
      { titre: "Vos parcours", description: "Décrivez les étapes utiles avant de connecter vos données." },
      { titre: "Vos intégrations", description: "Ajoutez vos services externes après avoir défini leurs accès." },
    ],
    note: "Aucune donnée métier ni intégration externe n’est préconfigurée.",
  },
  application: {
    libelle: "Application mobile",
    accroche: "Application mobile · automatisation non disponible",
    titre: "Le modèle mobile Expo n’est pas encore prêt.",
    description:
      "La création automatique actuelle produit des sites Next.js. Elle ne crée pas de projet mobile natif et ne doit pas être présentée comme telle.",
    sectionTitre: "Avant de démarrer une application",
    sectionDescription:
      "Un projet Expo doit protéger les secrets côté serveur et utiliser une passerelle adaptée.",
    elements: [
      { titre: "Projet Expo", description: "Le dépôt et les écrans React Native restent à mettre en place." },
      { titre: "Passerelle sécurisée", description: "Les secrets du connecteur ne doivent jamais être embarqués dans l’application." },
      { titre: "Publication mobile", description: "Les builds et les magasins d’applications ne sont pas configurés par ce flux." },
    ],
    note: "Aucun dépôt mobile ni build d’application n’est créé automatiquement.",
  },
};

export function chargerModeleSite(type: string | undefined): ModeleSite {
  if (type && Object.hasOwn(MODELES_SITE, type)) {
    return MODELES_SITE[type as TypeSiteModele];
  }
  return MODELES_SITE.vitrine;
}

export function normaliserNomSite(nom: string | undefined): string {
  const valeur = nom?.trim();
  return valeur && valeur.length <= 120 ? valeur : "Votre marque";
}
