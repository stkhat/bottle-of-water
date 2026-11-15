# Language learners: native language × learning language

Research notes from 2026-11-15. They estimate how many people are learning each language now, split by their native language, to help choose which language pairs Lingo adds next. The heatmap is [learner-matrix.html](learner-matrix.html); per-cell data (range, grade, top countries) is [learner-matrix.csv](learner-matrix.csv). Which pairs have enough dictionary data is a separate question, answered in [language-matrix.html](language-matrix.html).

## What a cell counts
- **Learners**: people currently studying the language at school, university, a language institute or in adult courses. Self-study and app learners are **not** counted: no source gives them by country (Duolingo publishes rankings, not counts).
- **Native language**: the language a learner reads most comfortably. Chinese varieties count as Chinese, Arabic varieties as Arabic, Indonesia's regional languages as Indonesian, Pakistan's Punjabi, Saraiki and Hindko as Urdu. Languages with their own written standard (Kurdish, Berber, Malay, Pashto, Malayalam…) are in "Other languages".
- **Rows** (learning languages) are sorted by learners counted, **columns** (native languages) by native speakers (population × share). The diagonal is empty.
- The **Not by country** column holds learners a source does not place in a country (rest of the world, worldwide institute totals, test takers). They are not spread over native languages.

## Method
1. **Learners per country, per learning language.** The language's own census where one exists; Eurostat `educ_uoe_lang01` for pupils in European schools (2024–2025, newer than most censuses, so it replaces their school figures); for English, Russian and Arabic, national enrolment × the school years that teach the language (formula in each row's note).
2. **Split by native language.** A country's learners are split in proportion to its population's native-language shares (censuses and the CIA World Factbook), leaving out people whose native language is the one being learned. Where a source counts one community only, that community gets them all: French-speaking Quebec pupils learning English, French-speaking Belgian pupils learning Dutch, Kerala (Malayalam) pupils learning Arabic.
3. **Native speakers per row**: population (World Bank 2024; Taiwan from its Ministry of the Interior) × share.
4. **Grade.** A: a direct count from a learner census or Eurostat. B: a census or enrolment figure with a stated assumption. C: a rough estimate, a single claim or an extrapolation. A cell's grade is the learner-weighted grade of its parts, and at most B when most of it comes from a country without a 90% majority language.
5. **Range.** The sum of each source row's low and high, by a stated rule (about ±10% / ±25% / ±50% for A / B / C, widened to cover other published figures). It is not a statistical interval.
6. Values are rounded to two significant figures.

## Sources per learning language
| Language | Total | Main source (edition) | Notes |
|---|---:|---|---|
| English | 950M | National enrolment: China MOE 2024 bulletin, India UDISE+ 2024-25, MEXT 2025, Brazil Censo 2024, UIS via World Bank for most others; Eurostat for Europe; Rosstat; NCES (5.3M US English learners) | India (0.9 × classes 1–12) and China (primary years 3–6, all secondary, half of university) are 43% of the column and both derived. Countries where English is the main school language are left out (Nigeria, Kenya, Ghana, Singapore…; about 120–140M more pupils). The Philippines, Pakistan and India stay in, flagged. |
| French | 51M | OIF *La langue française dans le monde* 2022 (2019/20), regional tables; 2014 edition for six African countries; Eurostat for Europe | Morocco, Algeria, Tunisia and Lebanon (17.6M) are counted by OIF as foreign-language learners though French is partly a teaching language there. 9M in Sub-Saharan Africa have no country breakdown. The 2026 report repeats 51M with no country table. |
| Arabic | 24M | National education data: Indonesia Kemenag madrasah enrolment, Iran MoE, Bangladesh BANBEIS (Alia madrasas), Turkey MEB (imam hatip), Kerala | Counts Arabic as a timetabled school subject only, not Quran recitation. Mostly grade C. |
| Spanish | 23M | Instituto Cervantes, *El español: lengua para el mundo* 2025, Cuadro 3 | Brazil cut to 2.2M (Cervantes 2026 yearbook reports a 46% fall; its table was unreachable). The US (9M) is Cervantes' own estimate and includes heritage speakers. |
| German | 16M | *Deutsch als Fremdsprache weltweit* 2020 (Auswärtiges Amt, Goethe-Institut, DAAD, ZfA, DW); Eurostat for Europe | The 2025 edition has no country table. Turkey: Eurostat 835k pupils vs. 169k in the 2020 survey. |
| Russian | 15M | Statistics offices and ministries of Uzbekistan, Kazakhstan, Tajikistan, Kyrgyzstan, Armenia (pupils in non-Russian-medium schools); Eurostat; Arefyev (2013, 2022) | No current per-country census. Belarus and Ukraine are left out. Arefyev's 2022 world figure "just over 16M" agrees. |
| Japanese | 4.3M | Japan Foundation *Survey on Japanese-Language Education Abroad* 2024 (4.0M) + MEXT FY2024 learners in Japan by nationality (0.29M) | Institutions only; the survey says self-learners are not counted. |
| Chinese | 3.3M | Host-country statistics (Eurostat, US K-12 and MLA, MEXT, Malaysia MOE), HSK takers, claims for Thailand (1M) and Russia | The Chinese government's figure of 30M learners abroad cannot be placed by country; it is only the upper bound of "Not by country". Korea's 0.55M is assumed equal to its Japanese learners. |
| Italian | 2.1M | MAECI *L'italiano nel mondo che cambia* 2019 (2017/18); Eurostat for Europe | Includes diaspora courses (US, Australia, Argentina, Germany…). |
| Korean | 1.2M | Korea MOE overseas-school counts, TOPIK and EPS-TOPIK applicants, King Sejong Institute, MEXT | No per-country census; 0.53M is not by country. Test applicants overlap with school counts. |
| Dutch | ≥0.38M | Eurostat (French-speaking Belgium, France) | A floor: German schools and universities worldwide are not counted. |
| Portuguese | ≥0.27M | Camões *Dados sobre a língua portuguesa* 2022; Eurostat | A floor: only the Camões network and Eurostat have figures (none for Uruguay, Argentina, Paraguay…). |

Turkish was searched for but has no per-country data (the Yunus Emre Institute gives only a world figure of about 91,000 taught in 2024), so it has no column.

## The matrix
Rows are the learning language, columns the native language. Each cell gives learners, then grade. "·" is the diagonal, "—" means no source places learners there.

| Learning (learners) | Chinese (1.4B) | Hindi (640M) | Spanish (490M) | Arabic (410M) | English (400M) | Bengali (290M) | Indonesian (290M) | Portuguese (250M) | Urdu (220M) | Russian (150M) | Japanese (120M) | Marathi (100M) | Vietnamese (98M) | Telugu (98M) | Tamil (90M) | Persian (84M) | German (82M) | Korean (77M) | French (76M) | Turkish (74M) | Thai (65M) | Italian (56M) | Polish (37M) | Ukrainian (33M) | Other languages (2.5B) | Not by country |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| English (950M) | 190M B | 95M B | 52M B | 60M B | · | 50M B | 36M B | 25M B | 37M B | 16M B | 11M B | 15M B | 15M B | 15M B | 14M B | 8.5M B | 7.3M B | 7.9M B | 9.8M B | 13M B | 8.5M B | 6.3M A | 4.8M A | 3.2M B | 210M B | 36M C |
| French (51M) | 210k B | 36k B | 2.5M A | 18M B | 3.2M B | 12k B | <10k B | 720k B | 27k B | 370k B | <10k A | <10k B | 48k A | <10k B | <10k B | 17k B | 1.6M B | 34k A | · | 120k B | 27k A | 1.5M A | 150k A | 94k B | 13M B | 9.0M C |
| Arabic (24M) | 62k C | — | <10k B | · | 45k B | 2.8M B | 9.2M B | <10k B | 300k C | 35k C | — | — | — | — | 15k C | 3.8M B | — | — | 24k B | 1.0M B | — | — | — | — | 4.5M C | 2.0M C |
| Spanish (23M) | 180k B | 21k C | · | 320k B | 10M B | <10k C | — | 2.3M B | <10k C | 72k B | 59k C | <10k C | <10k B | <10k C | <10k C | <10k B | 680k B | <10k C | 3.3M B | 48k B | — | 900k A | 300k A | 13k B | 4.0M B | 300k C |
| German (16M) | 160k A | 93k B | 310k B | 610k A | 1.5M B | 17k B | 160k A | 130k A | <10k B | 1.8M B | 240k A | 15k B | <10k B | 14k B | 12k B | <10k B | · | — | 860k B | 730k B | — | 410k B | 1.9M B | 500k B | 5.5M B | 760k C |
| Russian (15M) | 89k B | — | <10k B | <10k B | 25k B | — | — | — | — | · | — | — | <10k A | — | — | — | 64k B | 280k C | — | 12k A | — | — | 150k A | 12k B | 14M B | 300k C |
| Japanese (4.3M) | 1.3M A | 28k B | 61k B | 14k B | 490k B | 26k A | 750k A | 32k A | <10k B | 15k B | · | <10k B | 200k A | <10k B | 16k B | <10k B | 17k B | 550k A | 36k B | <10k B | 180k A | 11k B | <10k A | <10k B | 540k B | 45k C |
| Chinese (3.3M) | · | — | 38k B | <10k B | 220k B | <10k B | <10k B | <10k A | — | 98k C | 210k C | — | 170k C | — | <10k B | — | <10k C | 550k C | 38k B | <10k B | 910k C | 16k B | <10k C | <10k C | 250k C | 750k C |
| Italian (2.1M) | 29k B | <10k B | 220k A | 200k A | 460k B | — | — | 44k A | <10k B | 17k B | 26k A | — | <10k B | — | — | <10k B | 230k B | — | 310k B | 21k B | — | · | 50k B | <10k B | 400k B | 100k C |
| Korean (1.2M) | 76k C | — | <10k B | — | 18k B | — | — | — | <10k C | <10k B | 140k C | — | 88k C | — | — | — | — | · | — | — | 42k B | — | — | — | 250k C | 530k C |
| Dutch (≥380k) | — | — | <10k B | <10k B | <10k B | — | — | <10k B | — | — | — | — | — | — | — | — | — | — | 330k B | <10k B | — | — | — | — | <10k B | 50k C |
| Portuguese (≥270k) | <10k C | — | 33k A | <10k B | 18k C | — | — | · | — | — | — | — | — | — | — | — | <10k B | — | 21k B | <10k B | — | <10k B | — | — | 50k B | 130k C |

## What it shows
- English dwarfs everything: 950M formal learners, 18 times the next language. For every native language the biggest cell is English, except for English speakers themselves (Spanish 10M, French 3.2M).
- Outside English, the big cells are regional: Arabic speakers learning French (18M), Indonesian and Persian speakers learning Arabic (9.2M, 3.8M), Central Asian ("Other") speakers learning Russian (14M).
- Japanese is learned mostly by Chinese (1.3M), Indonesian (750k) and Korean (550k) speakers.
- The current development pair (Japanese speakers learning English) is about 11M formal learners.

## Limits
- Data years run from 2013 to 2025; German outside Europe is 2019/20, Italian 2017/18, some French rows 2013–2017.
- The native-language split assumes learners mirror their country's population; diaspora and heritage learners (Italian, Spanish and Portuguese in the Americas) are therefore credited to the majority language.
- Shares under 0.5% are folded into "Other languages", which undercounts small diaspora rows.
- The research files (per-country CSVs with a source URL and formula per row) were built in a scratch folder and are not in the repository; this note, the CSV and the page keep their results.
