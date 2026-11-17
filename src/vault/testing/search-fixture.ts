// A fictional mixed-language vault (English, German, and Polish from ./pl/) with the questions a person would ask it
// and the note that answers each: the hit-rate fixture of the search index. A query marked `crossLanguage` is asked in
// another language than its note, so only search by meaning can find it.
import { POLISH_NOTES, POLISH_QUERIES } from "./pl/search-fixture-pl.ts";

export interface FixtureNote {
  readonly path: string;
  readonly text: string;
}

export interface FixtureQuery {
  readonly query: string;
  readonly expected: string;
  readonly language: "en" | "de" | "pl";
  readonly crossLanguage?: true;
}

const ENGLISH_NOTES: readonly FixtureNote[] = [
  { path: "Work/Clients/Northwind.md", text: "# Northwind\n\n## Contract\nThe retainer covers 20 hours a month, billed on the first working day.\n\n## Contacts\nProject lead: Dana Example. Weekly call on Tuesdays at 10." },
  { path: "Work/Clients/Contoso.md", text: "# Contoso\n\nMigration of the reporting service to the new cloud region. Deadline: end of March.\n\n## Risks\nThe legacy database export takes six hours; schedule it over a weekend." },
  { path: "Work/Invoices.md", text: "# Invoices\n\nSend every invoice as a PDF by the fifth of the month. Late payment reminders go out after fourteen days." },
  { path: "Work/Onboarding.md", text: "# Onboarding checklist\n\n- Laptop with disk encryption\n- Password manager account\n- Read the incident runbook\n- Shadow one on-call shift" },
  { path: "Work/Runbook.md", text: "# Incident runbook\n\n## Database outage\nFail over to the replica, then page the database owner.\n\n## Certificate expiry\nRenew with the ACME client and reload the proxy." },
  { path: "Personal/Health/Dentist.md", text: "# Dentist\n\nCheck-up every six months. Next appointment booked for the second week of May. Bring the insurance card." },
  { path: "Personal/Car.md", text: "# Car\n\nTyres changed to winter tyres in November. Next service at 60,000 km; oil change included." },
  { path: "Personal/Recipes/Bread.md", text: "# Sourdough bread\n\n500 g flour, 350 g water, 100 g starter, 10 g salt. Proof overnight in the fridge, bake at 250 degrees." },
  { path: "Personal/Books.md", text: "# Reading list\n\nFinished: a history of navigation and a book on habits. Next: a field guide to mushrooms." },
  { path: "Learning/Rust.md", text: "# Rust notes\n\nOwnership: every value has one owner; borrowing gives references without moving. Lifetimes describe how long references live." },
  { path: "Learning/Kubernetes.md", text: "# Kubernetes\n\nA deployment manages replica sets; a service gives pods a stable address. Use readiness probes before routing traffic." },
  { path: "Travel/Packing.md", text: "# Packing list for long trips\n\nPassport, travel adapter, rain jacket, first aid kit, a copy of the insurance policy." },
];

const GERMAN_NOTES: readonly FixtureNote[] = [
  { path: "Arbeit/Kunden/Mueller.md", text: "# Kunde Mueller\n\nTreffen mit dem Kunden jeden zweiten Mittwoch. Das Angebot muss bis Freitag verschickt werden." },
  { path: "Arbeit/Steuern.md", text: "# Steuern\n\nDie Umsatzsteuervoranmeldung ist bis zum zehnten des Folgemonats fällig. Belege im Ordner Buchhaltung ablegen." },
  { path: "Arbeit/Urlaubsplanung.md", text: "# Urlaubsplanung\n\nIm August zwei Wochen frei. Vertretung durch das Team im Büro in Leipzig klären." },
  { path: "Privat/Wohnung.md", text: "# Wohnung\n\nDie Heizung wird im Oktober gewartet. Der Mietvertrag verlängert sich automatisch um ein Jahr." },
  { path: "Privat/Garten.md", text: "# Garten\n\nTomaten im Mai pflanzen, Rosen im Herbst schneiden. Der Kompost braucht regelmäßig Wasser." },
  { path: "Privat/Sport.md", text: "# Laufen\n\nTrainingsplan für den Halbmarathon: dreimal pro Woche, sonntags ein langer Lauf über achtzehn Kilometer." },
  { path: "Lernen/Datenbanken.md", text: "# Datenbanken\n\nEin Index beschleunigt Abfragen, kostet aber Speicher und verlangsamt Schreibvorgänge. Transaktionen sichern die Konsistenz." },
  { path: "Lernen/Fotografie.md", text: "# Fotografie\n\nBlende, Belichtungszeit und ISO bestimmen die Belichtung. Für Landschaften eine kleine Blende wählen." },
  { path: "Reisen/Zuerich.md", text: "# Zürich\n\nMit dem Zug vom Hauptbahnhof zum See in zehn Minuten. Das Museum hat montags geschlossen." },
];

const ENGLISH_QUERIES: readonly FixtureQuery[] = [
  { query: "how many hours does the Northwind retainer include", expected: "Work/Clients/Northwind.md", language: "en" },
  { query: "when is the weekly call with Northwind", expected: "Work/Clients/Northwind.md", language: "en" },
  { query: "Contoso migration deadline", expected: "Work/Clients/Contoso.md", language: "en" },
  { query: "by which day must invoices be sent", expected: "Work/Invoices.md", language: "en" },
  { query: "what to do when the database is down", expected: "Work/Runbook.md", language: "en" },
  { query: "renew certificate", expected: "Work/Runbook.md", language: "en" },
  { query: "new employee checklist", expected: "Work/Onboarding.md", language: "en" },
  { query: "next dentist appointment", expected: "Personal/Health/Dentist.md", language: "en" },
  { query: "car service mileage", expected: "Personal/Car.md", language: "en" },
  { query: "sourdough recipe flour water", expected: "Personal/Recipes/Bread.md", language: "en" },
  { query: "rust borrowing and ownership", expected: "Learning/Rust.md", language: "en" },
  { query: "kubernetes readiness probe", expected: "Learning/Kubernetes.md", language: "en" },
  { query: "what to pack for a long trip", expected: "Travel/Packing.md", language: "en" },
  { query: "Contoso databse export risk", expected: "Work/Clients/Contoso.md", language: "en" },
];

const GERMAN_QUERIES: readonly FixtureQuery[] = [
  { query: "Wann ist das Treffen mit dem Kunden Mueller", expected: "Arbeit/Kunden/Mueller.md", language: "de" },
  { query: "Frist Umsatzsteuervoranmeldung", expected: "Arbeit/Steuern.md", language: "de" },
  { query: "Urlaub im August Vertretung", expected: "Arbeit/Urlaubsplanung.md", language: "de" },
  { query: "Wartung der Heizung", expected: "Privat/Wohnung.md", language: "de" },
  { query: "wann Tomaten pflanzen", expected: "Privat/Garten.md", language: "de" },
  { query: "Trainingsplan Halbmarathon", expected: "Privat/Sport.md", language: "de" },
  { query: "Index Abfragen Datenbanken", expected: "Lernen/Datenbanken.md", language: "de" },
  { query: "Blende für Landschaften", expected: "Lernen/Fotografie.md", language: "de" },
  { query: "zurich museum montag", expected: "Reisen/Zuerich.md", language: "de" },
];

const CROSS_LANGUAGE_QUERIES: readonly FixtureQuery[] = [
  { query: "when should I plant tomatoes", expected: "Privat/Garten.md", language: "en", crossLanguage: true },
  { query: "half marathon training plan", expected: "Privat/Sport.md", language: "en", crossLanguage: true },
  { query: "Wann ist der nächste Zahnarzttermin", expected: "Personal/Health/Dentist.md", language: "de", crossLanguage: true },
];

export const SEARCH_FIXTURE_NOTES: readonly FixtureNote[] = [...ENGLISH_NOTES, ...GERMAN_NOTES, ...POLISH_NOTES];

export const SEARCH_FIXTURE_QUERIES: readonly FixtureQuery[] = [...ENGLISH_QUERIES, ...GERMAN_QUERIES, ...POLISH_QUERIES, ...CROSS_LANGUAGE_QUERIES];

/** The folders that hold the fixture's notes, for picking them all. */
export const SEARCH_FIXTURE_FOLDERS: readonly string[] = [...new Set(SEARCH_FIXTURE_NOTES.map((note) => note.path.split("/")[0] ?? ""))];
