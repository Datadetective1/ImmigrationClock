import type { LocaleStrings } from "./strings";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const fr: LocaleStrings = {
  htmlLang: "fr",
  endonym: "Français",

  subject: (n, coreNews) => {
    if (n === 0) return "Semaine calme : aucun changement officiel";
    const more = `${n} mise${n === 1 ? "" : "s"} à jour`;
    return coreNews.length === 0
      ? `H-1B, carte verte emploi : rien de neuf. ${more}`
      : `Du nouveau : ${fr.joinList(coreNews)}. ${more}`;
  },
  preheader: (n, top) =>
    n === 0
      ? "Aucun changement officiel significatif n'a été enregistré cette semaine."
      : top
        ? `À la une : ${top}. Chaque mise à jour renvoie à sa source officielle.`
        : `${n} changement${n === 1 ? "" : "s"} officiel${n === 1 ? "" : "s"} de l'immigration américaine, chacun lié à son document source.`,

  hero: {
    title: (coreNews) =>
      coreNews.length === 0
        ? "Aucun changement pour le H-1B ni la carte verte par l'emploi cette semaine"
        : `Du nouveau cette semaine pour ${fr.joinList(coreNews)}`,
    quietWeek: "Une semaine calme pour l'immigration officielle",
    meta: (n, m) => `${n} mise${n === 1 ? "" : "s"} à jour officielle${n === 1 ? "" : "s"} · ${m} min de lecture`,
  },

  core: { h1b: "H-1B", employmentGreenCard: "carte verte emploi" },
  joinList: (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`),

  board: {
    title: "Les sujets que nous suivons",
    noChange: "Aucun changement",
    news: "Nouveau cette semaine",
    note:
      "« Aucun changement » signifie que nos sources n'ont rien enregistré sur ce sujet cette semaine. " +
      "Cela décrit nos archives, pas le monde entier : vérifiez toujours la source officielle avant d'agir.",
  },

  kind: {
    new_information: "Nouvelle information",
    updated_information: "Mise à jour de politique",
    correction: "Correction",
    historical_revision: "Révision",
    announcement: "Annonce",
    data_release: "Publication de données",
    proposed_rule: "Règle proposée",
    final_rule: "Règle définitive",
    executive_action: "Action de l'exécutif",
    court_decision: "Décision de justice",
    legislative_action: "Législation",
    deadline: "Échéance",
  },

  cta: {
    kicker: "Alertes gratuites",
    title: "Vous suivez le Visa Bulletin ?",
    body:
      "Recevez par e-mail les deux dates de votre catégorie et de votre pays à chaque nouveau mois du Visa Bulletin.",
    button: "Activer les alertes gratuites",
  },

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "Changements officiels de l'immigration américaine, depuis les sources gouvernementales.",
  },

  issueLabel: (from, to) => `Semaine du ${fmt(from)} au ${fmt(to)}`,
  date: (iso) => fmt(iso),

  opening: {
    withChanges: (shown, recorded) =>
      recorded > shown
        ? `Cette semaine a apporté ${recorded} mises à jour officielles en matière d'immigration. ` +
          `${shown === 1 ? "La plus importante figure" : `Les ${shown} plus importantes figurent`} ci-dessous ; les autres sont dans les archives.`
        : `Cette semaine a apporté ${shown} mise${shown === 1 ? "" : "s"} à jour officielle${shown === 1 ? "" : "s"} en matière d'immigration.`,
    noChanges:
      "Aucun changement officiel significatif n'a été enregistré cette semaine. Cela décrit ce que nos " +
      "sources ont publié, sans garantir qu'il ne s'est rien passé : les avis de routine continuent " +
      "d'alimenter les archives, et nous revenons la semaine prochaine.",
  },

  sections: {
    snapshot: "La semaine en bref",
    topChanges: "Ce qui a changé cette semaine",
    unchanged: "Ce qui n'a pas changé",
    upcoming: "À venir",
    quickNumbers: "En chiffres",
    explore: "Continuez à explorer ImmigrationClock",
  },

  snapshot: {
    readingTime: (m) => `Temps de lecture estimé : ${m} minute${m === 1 ? "" : "s"}`,
    none: (label) => `Aucun${/^[aeiouéè]/i.test(label) ? "e" : ""} ${label.toLowerCase()}`,
  },

  unchanged: {
    intro:
      "Nous surveillons ces sujets de près. Rien n'a été enregistré les concernant cette semaine, ce " +
      "qui décrit nos archives et non le monde entier : vérifiez toujours la source officielle avant d'agir.",
    topics: {
      h1b: "Règles H-1B et quota annuel",
      daca: "DACA",
      tps: "Statut de protection temporaire (TPS)",
      asylum: "Asile et admission de réfugiés",
      students: "Visas étudiants F-1",
      employmentGreenCard: "Cartes vertes par l'emploi",
    },
    allChanged: "Tous les sujets que nous suivons ont évolué cette semaine. Voir ci-dessus.",
  },

  upcoming: {
    recurring: "Récurrent",
    note: "Dates publiées par l'agence elle-même. Elles peuvent changer ; le lien fait foi.",
  },

  leadGroup: (label) => `Principaux changements : ${label}`,

  item: {
    severity: { major: "Majeur", notable: "Notable", routine: "Courant" },
    agency: "Agence",
    published: "Publié le",
    scheduled: "Publication prévue",
    notInForce: "Proposition : non en vigueur",
    whyItMatters: "Pourquoi c'est important",
    readDocument: "Lire le document officiel",
    fromDocument: "Extrait du texte officiel",
    top: "À la une",
  },

  stats: {
    uscis_policy: "Mises à jour de politique USCIS",
    executive_actions: "Décrets et proclamations",
    federal_register: "Documents du Federal Register",
    court_decisions: "Décisions de justice",
    dhs_announcements: "Annonces du DHS",
    total_recorded: "Changements enregistrés au total",
    other_changes: "Autres changements enregistrés",
  },

  explore: {
    searchVisa: "Rechercher votre visa",
    latestChanges: "Derniers changements",
    processingTimes: "Délais et dates clés",
    countries: "Informations par pays",
    greenCard: "Carte verte",
    citizenship: "Citoyenneté",
    h1b: "H-1B",
  },

  trust: {
    statement:
      "Chaque mise à jour renvoie directement à la source gouvernementale d'origine. Nous résumons des " +
      "informations publiques. Nous ne donnons jamais de conseils juridiques.",
    sourceLanguageNote:
      "Les titres et résumés sont cités exactement tels que publiés par le gouvernement américain, en " +
      "anglais. Nous ne traduisons pas les textes officiels : une citation traduite n'est plus une citation.",
  },

  footer: {
    about: "À propos",
    methodology: "Méthodologie",
    sources: "Sources",
    privacy: "Confidentialité",
    contact: "Contact",
    unsubscribe: "Se désabonner",
    viewOnline: "Lire ce numéro en ligne",
    disclaimer:
      "ImmigrationClock publie des données publiques du gouvernement américain. Ce n'est pas un cabinet d'avocats et ne fournit aucun conseil juridique.",
    readIn: "Lire en",
  },
};
