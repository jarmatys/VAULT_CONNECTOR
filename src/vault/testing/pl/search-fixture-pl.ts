// The Polish part of the search fixture (fictional notes and questions); Polish language data lives in a pl/ folder.
import type { FixtureNote, FixtureQuery } from "../search-fixture.ts";

export const POLISH_NOTES: readonly FixtureNote[] = [
  { path: "Praca/Klienci/Kowalski.md", text: "# Klient Kowalski\n\nSpotkanie z klientem w każdą środę o 9. Budżet na wdrożenie to 120 godzin, rozliczany co miesiąc." },
  { path: "Praca/Faktury.md", text: "# Faktury\n\nFakturę wystawiam do piątego dnia miesiąca. Przelew powinien wpłynąć w ciągu czternastu dni." },
  { path: "Praca/Wdrożenia.md", text: "# Wdrożenia\n\nPrzed wdrożeniem na produkcję: kopia zapasowa bazy, testy integracyjne i okno serwisowe w nocy." },
  { path: "Prywatne/Zdrowie/Lekarz.md", text: "# Lekarz rodzinny\n\nBadania krwi raz w roku, najbliższa wizyta kontrolna w marcu. Skierowanie do okulisty odebrane." },
  { path: "Prywatne/Mieszkanie.md", text: "# Mieszkanie\n\nPrzegląd kominiarski we wrześniu. Licznik wody odczytuje administracja co kwartał." },
  { path: "Prywatne/Samochód.md", text: "# Samochód\n\nPrzegląd techniczny ważny do lipca. Ubezpieczenie OC odnawia się automatycznie w grudniu." },
  { path: "Prywatne/Przepisy/Pierogi.md", text: "# Pierogi ruskie\n\nCiasto: mąka, woda, szczypta soli. Farsz: ziemniaki, twaróg, smażona cebula. Gotować trzy minuty od wypłynięcia." },
  { path: "Nauka/Angielski.md", text: "# Angielski\n\nCodziennie piętnaście minut słówek. Czasy przeszłe: past simple dla zakończonych czynności, present perfect dla doświadczeń." },
  { path: "Nauka/Inwestowanie.md", text: "# Inwestowanie\n\nPortfel: fundusze indeksowe i obligacje skarbowe. Rebalansowanie raz w roku, w styczniu." },
];

export const POLISH_QUERIES: readonly FixtureQuery[] = [
  { query: "kiedy mam spotkanie z klientem Kowalskim", expected: "Praca/Klienci/Kowalski.md", language: "pl" },
  { query: "ile godzin budżetu na wdrożenie", expected: "Praca/Klienci/Kowalski.md", language: "pl" },
  { query: "do którego dnia wystawić fakturę", expected: "Praca/Faktury.md", language: "pl" },
  { query: "co zrobić przed wdrożeniem na produkcję", expected: "Praca/Wdrożenia.md", language: "pl" },
  { query: "badania krwi", expected: "Prywatne/Zdrowie/Lekarz.md", language: "pl" },
  { query: "przeglad kominiarski", expected: "Prywatne/Mieszkanie.md", language: "pl" },
  { query: "do kiedy ważny przegląd samochodu", expected: "Prywatne/Samochód.md", language: "pl" },
  { query: "przepis na pierogi", expected: "Prywatne/Przepisy/Pierogi.md", language: "pl" },
  { query: "rebalansowanie portfela", expected: "Nauka/Inwestowanie.md", language: "pl" },
  { query: "nauka słówek angielski", expected: "Nauka/Angielski.md", language: "pl" },
  { query: "kiedy wymienić opony na zimowe", expected: "Personal/Car.md", language: "pl", crossLanguage: true },
  { query: "lista rzeczy do spakowania na podróż", expected: "Travel/Packing.md", language: "pl", crossLanguage: true },
];
