import type { LocaleStrings } from "./strings";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const es: LocaleStrings = {
  htmlLang: "es",
  endonym: "Español",

  subject: (n) =>
    n === 0 ? "Immigration Pulse — semana tranquila" : `Immigration Pulse — ${n} cambio${n === 1 ? "" : "s"}`,
  preheader: (n) =>
    n === 0
      ? "Esta semana no se registraron cambios oficiales significativos."
      : `${n} cambio${n === 1 ? "" : "s"} oficial${n === 1 ? "" : "es"} en la inmigración de EE. UU., cada uno enlazado a su documento fuente.`,

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "Cambios oficiales de inmigración de EE. UU., desde fuentes gubernamentales.",
  },

  issueLabel: (from, to) => `Semana del ${fmt(from)} al ${fmt(to)}`,

  opening: {
    withChanges: (n) =>
      `Esta semana hubo ${n} actualización${n === 1 ? "" : "es"} oficial${n === 1 ? "" : "es"} de inmigración. ` +
      `Cada elemento enlaza directamente con la publicación gubernamental de la que procede. ` +
      `Informamos de lo que cambió; no le decimos lo que significa para su caso.`,
    noChanges:
      "Esta semana no se registraron cambios oficiales significativos. Esto describe lo que publicaron " +
      "nuestras fuentes, no garantiza que no ocurriera nada: los avisos rutinarios siguen entrando en el " +
      "archivo y volveremos la próxima semana.",
  },

  sections: {
    topChanges: "Los cambios de esta semana",
    quickNumbers: "En cifras",
    explore: "Siga explorando ImmigrationClock",
  },

  item: {
    severity: { major: "Importante", notable: "Relevante", routine: "Rutinario" },
    agency: "Agencia",
    published: "Publicado",
    scheduled: "Programado para publicación",
    notInForce: "Propuesta — no está en vigor",
    whyItMatters: "Por qué importa",
    readDocument: "Leer el documento oficial",
  },

  stats: {
    uscis_policy: "Actualizaciones de política de USCIS",
    executive_actions: "Órdenes ejecutivas y proclamaciones",
    federal_register: "Documentos del Federal Register",
    court_decisions: "Decisiones judiciales",
    dhs_announcements: "Anuncios del DHS",
    total_recorded: "Cambios registrados en total",
  },

  explore: {
    searchVisa: "Busque su visa",
    latestChanges: "Últimos cambios migratorios",
    processingTimes: "Trámites y fechas clave",
    countries: "Información por país",
    greenCard: "Green card",
    citizenship: "Ciudadanía",
    h1b: "H-1B",
  },

  trust: {
    statement:
      "Cada actualización enlaza directamente con la fuente gubernamental original. Resumimos información " +
      "pública. Nunca damos asesoramiento legal.",
    sourceLanguageNote:
      "Los títulos y resúmenes se citan exactamente como los publicó el gobierno de EE. UU., en inglés. " +
      "No traducimos el texto oficial, porque una cita traducida deja de ser una cita.",
  },

  footer: {
    about: "Acerca de",
    methodology: "Metodología",
    sources: "Fuentes",
    privacy: "Privacidad",
    contact: "Contacto",
    unsubscribe: "Cancelar suscripción",
    viewOnline: "Leer este número en línea",
    disclaimer:
      "ImmigrationClock informa sobre datos públicos del gobierno de EE. UU. No es un bufete de abogados y no ofrece asesoramiento legal.",
    readIn: "Leer en",
  },
};
