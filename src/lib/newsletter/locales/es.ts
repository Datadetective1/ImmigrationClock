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
    withChanges: (shown, recorded) =>
      (recorded > shown
        ? `Esta semana hubo ${recorded} actualizaciones oficiales de inmigración. A continuación ` +
          `${shown === 1 ? "figura la más importante" : `figuran las ${shown} más importantes`}; el resto están en el archivo. `
        : `Esta semana hubo ${shown} actualización${shown === 1 ? "" : "es"} oficial${shown === 1 ? "" : "es"} de inmigración. `) +
      `Cada elemento enlaza directamente con la publicación gubernamental de la que procede. ` +
      `Informamos de lo que cambió; no le decimos lo que significa para su caso.`,
    noChanges:
      "Esta semana no se registraron cambios oficiales significativos. Esto describe lo que publicaron " +
      "nuestras fuentes, no garantiza que no ocurriera nada: los avisos rutinarios siguen entrando en el " +
      "archivo y volveremos la próxima semana.",
  },

  sections: {
    snapshot: "La semana de un vistazo",
    topChanges: "Lo que cambió esta semana",
    unchanged: "Lo que no cambió",
    upcoming: "Próximas fechas",
    quickNumbers: "En cifras",
    explore: "Siga explorando ImmigrationClock",
  },

  snapshot: {
    readingTime: (m) => `Tiempo de lectura estimado: ${m} minuto${m === 1 ? "" : "s"}`,
    none: (label) => `Sin ${label.toLowerCase()}`,
  },

  unchanged: {
    intro:
      "Vigilamos estos temas de cerca. Esta semana no se registró nada sobre ellos, lo que describe " +
      "nuestro archivo y no el mundo entero: confirme siempre en la fuente oficial antes de actuar.",
    topics: {
      h1b: "Normas del H-1B y su límite anual",
      daca: "DACA",
      tps: "Estatus de Protección Temporal (TPS)",
      asylum: "Asilo y admisión de refugiados",
      students: "Visas de estudiante F-1",
      employmentGreenCard: "Green cards por empleo",
    },
    allChanged: "Todos los temas que vigilamos tuvieron novedades esta semana; véalas arriba.",
  },

  upcoming: {
    recurring: "Periódico",
    note: "Fechas publicadas por la propia agencia. Pueden cambiar; el enlace es la autoridad.",
  },

  leadGroup: (label) => `Principales cambios: ${label}`,

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
    other_changes: "Otros cambios registrados",
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
