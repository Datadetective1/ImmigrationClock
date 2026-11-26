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

  subject: (n, coreNews) => {
    if (n === 0) return "Semana tranquila: sin cambios oficiales nuevos";
    const more = `${n} actualizaci${n === 1 ? "ón" : "ones"}`;
    return coreNews.length === 0
      ? `Semana tranquila en H-1B y green card laboral: ${n} novedad${n === 1 ? "" : "es"}`
      : `${es.joinList(coreNews)}: hay novedades. ${more}`;
  },
  preheader: (n, top, topIsCore) =>
    n === 0
      ? "Esta semana no se registraron cambios oficiales significativos."
      : top
        ? `${topIsCore ? "Lo principal" : "También esta semana"}: ${top}. Cada novedad enlaza a su fuente oficial.`
        : `${n} cambio${n === 1 ? "" : "s"} oficial${n === 1 ? "" : "es"} en la inmigración de EE. UU., cada uno enlazado a su documento fuente.`,

  hero: {
    title: (coreNews) =>
      coreNews.length === 0
        ? "Semana tranquila para H-1B y la green card laboral"
        : `Novedades esta semana en ${es.joinList(coreNews)}`,
    quietWeek: "Una semana tranquila en la inmigración oficial",
    meta: (n, m) => `${n} actualizaci${n === 1 ? "ón oficial" : "ones oficiales"} · ${m} min de lectura`,
  },

  core: { h1b: "H-1B", employmentGreenCard: "green card laboral" },
  joinList: (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`),

  board: {
    title: "Los temas que seguimos",
    noChange: "Sin cambios",
    news: "Novedad esta semana",
    note:
      "«Sin cambios» significa que nuestras fuentes no registraron nada sobre ese tema esta semana. " +
      "Describe nuestro archivo, no el mundo entero: confirme siempre en la fuente oficial antes de actuar.",
  },

  audience: {
    sij: "Solicitantes de Inmigrante Juvenil Especial (SIJ)",
    medicalExam: "Solicitantes de green card que necesitan examen médico (Formulario I-693)",
    h1b: "Trabajadores y empleadores H-1B",
    seasonal: "Trabajadores temporales y agrícolas (H-2A, H-2B)",
    students: "Estudiantes internacionales y visitantes de intercambio",
    daca: "Beneficiarios de DACA",
    tps: "Personas con Estatus de Protección Temporal",
    asylum: "Solicitantes de asilo y refugiados",
    employmentGreenCard: "Solicitantes de green card por empleo",
    family: "Inmigrantes por vía familiar y sus patrocinadores",
    naturalization: "Solicitantes de naturalización",
    visaBulletin: "Personas a la espera de una fecha del Boletín de Visas",
    fees: "Quien presente trámites ante USCIS (tarifas)",
    immigrationCourt: "Personas con casos ante el tribunal de inmigración",
    labor: "Trabajadores y empleadores bajo la ley laboral de EE. UU.",
  },

  kind: {
    new_information: "Información nueva",
    updated_information: "Actualización de política",
    correction: "Corrección",
    historical_revision: "Revisión",
    announcement: "Anuncio",
    data_release: "Publicación de datos",
    proposed_rule: "Norma propuesta",
    final_rule: "Norma final",
    executive_action: "Acción ejecutiva",
    court_decision: "Decisión judicial",
    legislative_action: "Legislación",
    deadline: "Plazo",
  },

  cta: {
    kicker: "Boletín de Visas",
    title: "¿Espera el Boletín de Visas?",
    body:
      "Suscríbase a alertas gratuitas por correo con las dos fechas de su categoría y país.",
    button: "Suscribirse gratis",
  },

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "Cambios oficiales de inmigración de EE. UU., desde fuentes gubernamentales.",
  },

  issueLabel: (from, to) => `Semana del ${fmt(from)} al ${fmt(to)}`,
  date: (iso) => fmt(iso),

  opening: {
    withChanges: (shown, recorded) =>
      recorded > shown
        ? `Esta semana hubo ${recorded} actualizaciones oficiales de inmigración. A continuación ` +
          `${shown === 1 ? "figura la más importante" : `figuran las ${shown} más importantes`}; el resto están en el archivo.`
        : `Esta semana hubo ${shown} actualización${shown === 1 ? "" : "es"} oficial${shown === 1 ? "" : "es"} de inmigración.`,
    noChanges:
      "Esta semana no se registraron cambios oficiales significativos. Esto describe lo que publicaron " +
      "nuestras fuentes, no garantiza que no ocurriera nada: los avisos rutinarios siguen entrando en el " +
      "archivo y volveremos la próxima semana.",
  },

  sections: {
    others: "Otras novedades oficiales de la semana",
    snapshot: "La semana de un vistazo",
    topChanges: "H-1B, green card y Boletín de Visas",
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
    notInForce: "Propuesta: no está en vigor",
    whyItMatters: "Por qué importa",
    readDocument: "Leer el documento oficial",
    fromDocument: "Del texto oficial",
    top: "Lo principal",
    about: "A quién se refiere",
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
