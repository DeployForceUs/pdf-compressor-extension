# Smart Compression (Pro): итоговое предложение по исследованию и тестированию

**Проект:** PDF Compressor Chrome Extension  
**Версия документа:** 1.0  
**Дата:** 17 июля 2026  
**Статус:** Product/Technical Research Proposal — не утверждённое Implementation Specification

---

## 1. Executive Summary

Предлагается не добавлять в PDF Compressor ещё один универсальный JPEG engine и не создавать тяжёлый «режим улучшения качества» с одинаковыми фильтрами для всех документов.

Вместо этого предлагается исследовать **Smart Compression (Pro)** — адаптивный pipeline, который анализирует каждое встроенное изображение PDF, создаёт ограниченный набор безопасных candidates и сохраняет только доказанно лучший вариант.

Основная гипотеза:

> Конкурентное преимущество можно получить не за счёт уникального codec, а за счёт per-image decision logic: effective DPI analysis, safe skip rules, candidate comparison и validation.

Целевой рынок — **не частные пользователи**, а небольшие фирмы, регулярно работающие с PDF:

- small law firms;
- small medical practices;
- real estate services;
- insurance and financial services firms;
- небольшие компании, работающие с government forms и permits.

Главная бизнес-задача:

> Надёжно обработать конфиденциальный business PDF на обычном office computer, уменьшить его до email-friendly размера и не повредить значимые детали документа.

До включения Smart Compression в основное ТЗ требуется bounded research program с массовым прогоном PDF corpus, автоматическими metrics, structural validation и blind human review.

---

## 2. Product Context and Boundaries

### 2.1. Текущая сильная сторона продукта

Главное уже существующее продуктовое преимущество:

> Local Split + Compress in one workflow.

Smart Compression не должен размывать эту ценность или превращать extension в универсальный PDF-комбайн.

### 2.2. Что предлагается построить

Минимальный Pro-режим:

```text
Smart Compression (Pro)

Analyzes each image separately to reduce size while preserving clarity.
Processing may take longer. Files never leave your device.
```

### 2.3. Что сознательно не входит в первую версию

- universal denoise;
- median filter для всех scans;
- automatic sharpening;
- deskew;
- OCR;
- full-page rasterization;
- AVIF/WebP внутри PDF;
- новый JPEG WASM encoder;
- remote-loaded WASM;
- попытка «восстановить» потерянное качество;
- сложные пользовательские sliders и технические настройки.

Scan cleanup может стать отдельной будущей Pro-функцией только после отдельного исследования:

```text
Enhance scanned documents (Pro)
```

Она не должна смешиваться с безопасным Smart Compression, потому что изменяет внешний вид и потенциально содержание документа.

---

## 3. Proposed Smart Compression Architecture

### 3.1. Основной pipeline

```text
Analyze
→ Classify risk and content
→ Generate limited candidates
→ Compare size and quality
→ Keep the winner
→ Rewrite only Image XObjects
→ Save and reopen
→ Validate structure and content
```

Оригинал всегда остаётся одним из candidates. Если выигрыш не доказан, изображение не изменяется.

### 3.2. Analyze

Для каждого уникального PDF Image XObject определяется:

- исходный filter и format;
- compressed size;
- pixel dimensions;
- effective DPI с учётом фактического размера на странице;
- ColorSpace: RGB, Gray, CMYK, Indexed;
- BitsPerComponent;
- `Mask` / `SMask` / transparency;
- shared usage на нескольких страницах;
- приблизительный content type;
- признаки уже оптимизированного изображения;
- risk flags, при которых recompression запрещается.

### 3.3. Content and risk classes

В перспективе:

- `PHOTO`;
- `TEXT_SCAN`;
- `MIXED_SCAN`;
- `LINE_ART`;
- `ALREADY_OPTIMIZED`;
- `RISKY`.

Однако первая исследовательская версия не должна сразу реализовывать полный classifier. Сначала проверяется наиболее ценная гипотеза — effective DPI optimization.

### 3.4. Initial candidates

Первая версия создаёт максимум три candidates:

1. `Original`;
2. текущий `Basic` candidate;
3. `DPI-aware candidate`: safe downscale до целевого effective DPI с более высоким JPEG quality.

Пример:

| Candidate | Размер | Quality score | Решение |
|---|---:|---:|---|
| Original | 4.2 MB | 100 | Слишком большой |
| Basic JPEG 75 | 1.3 MB | 86 | Baseline |
| Downscale + JPEG 85 | 1.2 MB | 92 | Winner |

Ключевой принцип:

> Выбирается candidate с наилучшим качеством, который не превышает byte budget текущего Basic candidate или даёт другой заранее утверждённый измеряемый trade-off.

### 3.5. Quality Gate

Candidate должен пройти обе проверки:

1. **Size gate** — достигнута значимая экономия или соблюдён byte budget.
2. **Quality gate** — candidate не демонстрирует неприемлемой потери деталей.

Automated metrics могут включать:

- luminance SSIM;
- color difference;
- edge preservation;
- small-text region comparison;
- barcode/QR readability tests для специальных fixtures.

Automated metrics не считаются окончательной истиной. Они используются для triage и отбора документов на human review.

### 3.6. Safe PDF modification

Smart Compression изменяет только подтверждённо безопасные Image XObjects.

Он не должен:

- rasterize страницу целиком;
- изменять selectable text;
- превращать vector content в bitmap;
- удалять links;
- ломать forms или annotations;
- изменять page boxes и rotation;
- молча инвалидировать digital signatures.

Signed PDF должен обнаруживаться до обработки. Утверждённое продуктовое поведение для него должно быть отдельно закреплено в specification: warning, skip или explicit user confirmation.

### 3.7. Execution model

```text
IndexedDB blobId
→ jobId
→ Offscreen processing / Worker
→ result blobId
```

Требования:

- не передавать большие `ArrayBuffer` через Chrome runtime messaging;
- не передавать `AbortSignal` через messaging;
- cancellation выполняется через `cancel(jobId)`;
- обрабатывается один уникальный Image XObject за раз;
- memory limit рассчитывается по decoded pixels и active buffers, а не только по размеру PDF;
- processing должен работать offline;
- WASM и executable code должны быть bundled locally.

---

## 4. Proposed User Experience

Минимальное изменение UI:

```text
Compression mode

○ Standard
● Smart (Pro)

Analyzes each image separately to reduce size while preserving clarity.
Processing may take longer. Files never leave your device.
```

После завершения показывается объяснимый result summary:

```text
Smart optimization complete

18 images optimized
6 high-resolution images resized
4 images preserved to protect quality
Result: 8.4 MB → 2.1 MB
```

Необходимо избегать абсолютных обещаний:

- «Maximum quality + minimum size»;
- «Improves every PDF»;
- «Restores image quality»;
- «HIPAA compliant» без отдельного compliance assessment.

Допустимое обещание:

> Each image is evaluated separately. If a safer or better candidate is not found, the original is preserved.

---

## 5. Steelman — Strongest Case For

### 5.1. Decision logic может отличать продукт при одинаковом engine

Два продукта могут использовать MuPDF, но получать разные результаты. Differentiator создаётся за счёт:

- effective DPI analysis;
- per-image candidates;
- safe skip rules;
- quality gates;
- накопленного benchmark corpus;
- измеряемых thresholds.

### 5.2. High-DPI images содержат реальный резерв

PDF часто содержит scans 600–1200 DPI, хотя для фактического отображения достаточно существенно меньшего effective DPI. Downscale с более высоким JPEG quality потенциально может быть одновременно меньше и визуально лучше текущего Basic candidate.

### 5.3. Candidate selection безопаснее одного preset

Smart mode не обязан изменять каждое изображение. Original и Basic остаются допустимыми winners.

### 5.4. Первая версия не требует нового codec

Это уменьшает:

- supply-chain risk;
- licensing risk;
- bundle size;
- Chrome Web Store risk;
- integration complexity.

### 5.5. Corpus становится долгосрочным engineering asset

Он будет использоваться для:

- MuPDF upgrades;
- JPEG/JPX changes;
- future Scan Cleanup;
- refactors;
- Chrome updates;
- regression detection.

### 5.6. Smart Compression усиливает Split + Compress

Smart logic может применяться в обычном Compress и в едином Split + Compress workflow без создания отдельного продукта.

---

## 6. Steelman Against — Strongest Case Against

### 6.1. Algorithm не знает намерение пользователя

Избыточное resolution для email может быть необходимым для:

- printing;
- zooming plans;
- OCR;
- image extraction;
- archival storage.

Downscale необратим, поэтому intent и safe thresholds критичны.

### 6.2. Automated quality metrics могут ошибаться

Высокий SSIM не гарантирует сохранность:

- мелких цифр;
- подписей;
- печатей;
- barcodes;
- тонких линий;
- слабоконтрастных annotations.

### 6.3. Smart processing может быть значительно тяжелее Basic

Создание и повторное декодирование нескольких candidates увеличивает:

- processing time;
- memory pressure;
- вероятность hangs;
- вероятность OOM;
- complexity cancellation.

### 6.4. PDF edge cases создают серьёзный tech debt

Риски включают:

- CMYK;
- Indexed ColorSpace;
- `SMask`;
- shared XObjects;
- nested forms;
- encrypted PDFs;
- signed PDFs;
- повреждённые object streams.

### 6.5. Пользователь может не увидеть ценность Pro

Дополнительные 5–8% savings относительно Basic могут быть технически интересны, но недостаточны для покупки.

### 6.6. Это не гарантированный moat

Зрелые compressors могут уже применять DPI thresholds, downsampling и adaptive rules. Наше преимущество должно быть доказано benchmark results, а не предполагаться.

### 6.7. Возможен неверный product priority

Пользователям могут быть важнее:

- Split + Compress;
- privacy;
- reliability;
- large-file stability;
- понятные outputs;
- минимальное число действий.

Поэтому исследование должно иметь заранее определённые kill criteria.

---

## 7. Target Customer and Test Scope

### 7.1. ICP

Целевые пользователи — сотрудники небольших фирм, регулярно обрабатывающие business PDFs.

Не являются primary ICP:

- разовые частные пользователи;
- крупные enterprise deployments на первом этапе;
- государственные учреждения как самостоятельный сегмент.

Government documents остаются релевантными для небольших компаний, работающих с permits, taxes, compliance, immigration и public contracts.

### 7.2. ICP Test Packs

| Test pack | Типичные документы | Критические детали |
|---|---|---|
| Small Law Firm | Contracts, pleadings, exhibits, signed agreements, scanned evidence | Fine print, redactions, signatures, case numbers |
| Small Medical Practice | Intake forms, referrals, lab results, insurance forms, fax-like records | Patient IDs, barcodes, tables, handwritten notes |
| Real Estate Services | Inspection reports, appraisals, listings, floor plans, permits | Photos, dimensions, thin lines, mixed content |
| Insurance / Financial Services | Claims, policies, statements, tax and mortgage forms | Account numbers, fine print, QR/barcodes, filled fields |

### 7.3. Почему Real Estate особенно важен для первого experiment

Real Estate documents часто объединяют:

- фотографии;
- scans;
- digital text;
- floor plans;
- forms;
- signatures.

Это сильный mixed-content test segment и потенциально более доступный initial market, чем regulated enterprise healthcare или finance.

---

## 8. Corpus Strategy

### 8.1. Corpus строится по content type, а industry используется как tag

Предварительное распределение:

- 25% — scanned text;
- 25% — mixed text + photos;
- 15% — photo-heavy reports;
- 15% — digital-native PDF;
- 10% — forms, signatures, stamps, redactions;
- 10% — edge cases: JPX, CMYK, masks, encrypted, signed, damaged.

Эти проценты являются начальной гипотезой, а не рыночной статистикой. Они должны корректироваться после первых customer interviews и анализа реальных workflows.

### 8.2. Recommended initial corpus

- 25–30 Small Law Firm PDFs;
- 25–30 Small Medical Practice PDFs;
- 30–40 Real Estate PDFs;
- 25–30 Insurance/Financial PDFs;
- 20 общих edge-case fixtures.

Итого: примерно **125–150 тщательно подобранных документов**.

Такой corpus полезнее тысячи случайных PDF.

### 8.3. Corpus maturity levels

#### Level 1 — Golden Corpus

30–50 документов. Каждый результат проверяется вручную.

Назначение:

- разработка algorithm;
- быстрые regressions;
- проверка critical details;
- запуск на каждом крупном изменении.

#### Level 2 — Diverse Corpus

200–500 документов.

Назначение:

- статистика выигрышей и проигрышей;
- tuning thresholds;
- поиск unsupported patterns;
- автоматический visual triage.

#### Level 3 — Robustness Corpus

1,000+ документов.

Назначение:

- crashes;
- hangs;
- memory leaks;
- timeouts;
- deterministic output;
- long-tail formats.

Полная визуальная проверка Level 3 не требуется.

### 8.4. Privacy-safe fixtures

Допустимые источники:

- public documents;
- synthetic documents;
- de-identified samples;
- документы с явным разрешением на internal testing.

Не допускается несанкционированное использование:

- medical records;
- private contracts;
- tax returns;
- insurance claims;
- других файлов с confidential или personal data.

### 8.5. Fixture manifest

Каждый документ получает metadata:

```json
{
  "id": "real_estate_inspection_014",
  "source": "synthetic",
  "license": "internal-test-use",
  "containsSensitiveData": false,
  "contentType": "MIXED_SCAN",
  "industry": "real_estate",
  "pages": 86,
  "originalBytes": 42133722,
  "expectedRisks": ["floor_plan", "small_text", "photos"]
}
```

---

## 9. Benchmark Pipeline

### 9.1. Overall flow

```text
Corpus manifest
→ Browser runner
→ Original / Basic / Smart outputs
→ Structural validator
→ Size, time and memory metrics
→ Page rendering and automated visual comparison
→ Triage queue
→ Blind human review
→ Decision report
```

### 9.2. Real extension environment

Финальный benchmark должен использовать тот же Chrome extension pipeline, что и production:

- IndexedDB;
- offscreen processing;
- Web Worker;
- current messaging;
- cancellation;
- persistence;
- output generation.

Отдельный Node runner допустим для algorithm experiments, но не заменяет browser acceptance.

### 9.3. Test-only benchmark page

Рекомендуется отдельный test-only entry point:

```text
benchmark.html
```

Он не должен попадать в пользовательский UI.

Playwright runner:

1. загружает fixture;
2. помещает файл в IndexedDB;
3. запускает Basic;
4. запускает Smart;
5. сохраняет outputs и metrics;
6. повторно открывает результаты;
7. запускает structural validation;
8. рендерит выбранные страницы;
9. записывает per-file JSON report.

### 9.4. Business-session tests

Небольшая фирма обрабатывает документы регулярно, поэтому тестируется не только один job:

```text
Process 10–20 PDFs sequentially
→ cancel one job
→ retry
→ close and reopen popup
→ download outputs
→ process another document
→ restart Chrome
```

Проверяется:

- рост memory между jobs;
- stale blobs в IndexedDB;
- корректность restored state;
- filenames и artifact ownership;
- деградация скорости;
- recovery после cancellation;
- работа после Chrome restart.

---

## 10. Metrics

### 10.1. Compression metrics

- Original size;
- Basic size;
- Smart size;
- Basic reduction vs Original;
- Smart reduction vs Original;
- additional Smart gain vs Basic;
- количество optimized, preserved и skipped images;
- skip reasons;
- количество qualifying PDFs.

### 10.2. Email-fit metrics

Основной business KPI:

> Может ли сотрудник отправить получившийся документ без дополнительного cloud upload?

Измеряются переходы:

- `>25 MB → <25 MB`;
- `>20 MB → <20 MB`;
- `>10 MB → <10 MB`;
- количество PDF, которым всё ещё требуется Split;
- количество необходимых parts;
- processing time до готового download.

Практические target tiers:

```text
Email 10 MB
Email 20 MB
Email 25 MB
```

Необходимо сохранять safety margin, а не целиться точно в лимит.

Reference limits:

- Gmail personal accounts: 25 MB — https://support.google.com/mail/answer/6584
- Outlook internet email accounts: commonly 20 MB; Exchange default may be 10 MB — https://support.microsoft.com/en-us/outlook/reduce-attachment-size-to-send-large-files-with-outlook

Business mail limits могут быть изменены administrator, поэтому 25 MB не считается универсальным значением.

### 10.3. Structural validation

Для каждого output:

- PDF повторно открывается;
- page count совпадает;
- page boxes совпадают;
- rotation совпадает;
- selectable text сохраняется;
- links сохраняются;
- forms и annotations не исчезают;
- output не содержит новых repair warnings;
- digital signature handling соответствует утверждённому product behavior.

Silent corruption недопустим.

### 10.4. Performance and reliability

- total processing time;
- time per page и per image;
- p50 / p95 processing time;
- peak process memory;
- decoded pixel peak;
- number of timeouts;
- cancellations and cancellation latency;
- crashes, hangs, OOM;
- deterministic output;
- memory growth after sequential jobs.

### 10.5. Privacy and data retention

Проверяется:

- отсутствие network uploads во время compression;
- отсутствие filenames, extracted text и document content в telemetry;
- работа offline;
- очистка temporary raster buffers;
- удаление или retention policy для IndexedDB blobs;
- отсутствие document content в crash logs;
- отсутствие remote executable code.

Local processing не объявляется автоматически HIPAA compliant.

---

## 11. Human Visual Review

### 11.1. Что проверяется обязательно

- все Smart losses относительно Basic;
- все structural warnings;
- все низкие automated visual scores;
- все документы, пересёкшие 10/20/25 MB threshold;
- signed documents;
- forms и annotations;
- barcodes и QR codes;
- floor plans;
- лучшие выигрыши;
- случайная выборка neutral и winning cases.

### 11.2. Blind review

Review interface показывает:

```text
Version A | Version B | Version C
```

Без указания, где Original, Basic и Smart.

Требования к dashboard:

- synchronized page navigation;
- synchronized zoom;
- 100% и 200% review;
- возможность отметить `A better`, `B better`, `same`, `unacceptable`;
- reason tags: text, photo, color, lines, barcode, signature, artifacts;
- сохранение reviewer decision в JSON/CSV.

### 11.3. Domain review

Желательно участие 1–2 представителей каждого начального workflow:

- paralegal;
- real estate inspector или appraiser;
- insurance agent;
- medical office administrator;
- CPA или mortgage processor.

Достаточно небольшой representative selection. Цель — обнаружить детали, которые инженерная оценка может пропустить.

---

## 12. Hardware and Run Matrix

| Runner | Назначение |
|---|---|
| Powerful machine | Быстрый массовый algorithm exploration |
| Windows 8 GB RAM | Нижняя representative business configuration |
| Windows 16 GB RAM | Typical office benchmark |
| macOS representative device | Compatibility и current developer/user workflow |
| Restricted/slow runner | Low-memory и slow-CPU behavior |
| CI | Только небольшой golden smoke suite |

Мощная машина используется для throughput, но её результаты не применяются для пользовательских performance claims.

Основной business benchmark проводится при realistic browser load, а не только в пустом Chrome profile.

---

## 13. Run Schedule

| Частота | Corpus | Назначение |
|---|---:|---|
| Каждый PR | 10–20 fixtures | Smoke test и critical regressions |
| Перед Merge крупного изменения | 30–50 golden fixtures | Full functional and visual gate |
| Manual/nightly research run | 200–500 PDFs | Statistics и long-tail discovery |
| Перед release или engine upgrade | 1,000+ PDFs | Robustness, hangs, memory leaks |

Большой corpus не запускается на каждом Commit, чтобы Pipeline не стал медленным и flaky.

---

## 14. Bounded Research Program

Во избежание конфликта с текущей нумерацией Phase работа называется **Smart Compression Research Program**, а не новым «Этапом 5».

### Slice A — Benchmark foundation

- fixture manifest;
- test-only browser runner;
- Original/Basic output capture;
- structural validation;
- JSON/CSV metrics;
- initial golden corpus.

### Slice B — Smart DPI prototype

- analyze safe JPEG/JPX Image XObjects;
- calculate effective DPI;
- generate Original, Basic и DPI-aware candidate;
- implement size gate;
- no new codec;
- no filters;
- no full-page rasterization.

### Slice C — Visual triage

- render selected pages;
- automated visual metrics;
- candidate disagreement detection;
- blind-review dashboard.

### Slice D — Mass run

- 125–150 ICP-focused PDFs;
- 200–500 diverse corpus when stable;
- powerful-machine exploration;
- representative-machine performance run;
- sequential business-session tests.

### Slice E — Decision

- summarize wins, losses and qualifying rate;
- evaluate email-fit improvement;
- review structural and visual regressions;
- compare development complexity with demonstrated Pro value;
- issue Go / Iterate / No-Go decision.

---

## 15. Go / No-Go Criteria

Thresholds below являются initial decision proposal и должны быть окончательно утверждены до mass run.

### Go

Переход к полноценному Implementation Specification допустим, если одновременно выполнены условия:

- median additional savings Smart vs Basic не менее примерно 15% на qualifying documents;
- qualifying documents встречаются не менее чем примерно в 30% ICP corpus;
- заметная доля файлов пересекает practical email thresholds 10/20/25 MB;
- blind review не выявляет систематического ухудшения critical details;
- structural validation проходит для 100% успешно обработанных outputs;
- отсутствует silent corruption;
- processing time на representative machine остаётся приемлемым для Pro и не превышает заранее утверждённый multiplier относительно Basic;
- нет новых систематических hangs, OOM и memory leaks;
- преимущества понятны и объяснимы пользователю.

### Iterate

Продолжить только узкое исследование, если:

- эффект значим только для одного ICP segment;
- найден сильный результат только для photo-heavy или high-DPI documents;
- качество хорошее, но performance требует optimization;
- email-fit улучшился, но average percentage savings ниже ожиданий.

В этом случае Smart Compression может стать segment-specific feature, а не универсальным режимом.

### No-Go

Эксперимент прекращается, если:

- дополнительный выигрыш относительно Basic обычно составляет только 5–8%;
- qualifying documents редки;
- human review регулярно обнаруживает деградацию fine text, plans, signatures или barcodes;
- processing существенно ухудшает reliability;
- необходим новый тяжёлый stack без доказанной business value;
- продуктовая ценность Split + Compress заметно сильнее и требует приоритета.

No-Go не считается неудачей: bounded experiment предотвращает дорогостоящий rabbit hole.

---

## 16. Risks and Controls

| Risk | Control |
|---|---|
| Corpus bias | ICP test packs + content-type distribution + random control sample |
| Cherry-picking wins | Blind review всех losses, suspicious cases и random winners |
| Metrics disagree with humans | Metrics only for triage; domain human review remains final |
| Powerful machine hides problems | Separate representative 8/16 GB runs |
| Confidential data leakage | Public/synthetic/de-identified corpus, offline runs, telemetry audit |
| Digital signature invalidation | Detection + explicit specification-defined behavior |
| Pipeline becomes a separate product | Reuse production extension path; test-only runner outside user UI |
| Benchmark infrastructure becomes rabbit hole | Build in slices; stop after minimum decision-quality evidence |
| New dependency without value | No new codec before benchmark proves need |
| Scope collision with current roadmap | Research Program does not change current Phase numbering or product spec |

---

## 17. Final Recommendation

1. Не принимать ранее предложенный Advanced Compression Addendum как implementation-ready specification.
2. Не добавлять новый JPEG engine и универсальные image filters до получения benchmark evidence.
3. Создать bounded **Smart Compression Research Program**.
4. Начать с узкого **Smart DPI Candidate Selector**.
5. Построить initial corpus из 125–150 реалистичных PDF небольших фирм, начиная с 30–50 golden fixtures.
6. Измерять не только compression ratio, но и business outcome: переход ниже email thresholds 10/20/25 MB.
7. Проверять production-like Chrome extension pipeline, sequential business sessions, privacy, cleanup и representative office hardware.
8. Проводить blind visual review не только лучших результатов, но всех losses, suspicious cases и random controls.
9. После mass run принять формальное решение Go / Iterate / No-Go.
10. Только при Go подготовить отдельное Implementation Specification и обновить canonical project specification.

Итоговая позиция:

> Smart Compression потенциально может стать реальным Pro-преимуществом, но только если массовый ICP-focused benchmark докажет, что adaptive decision logic заметно превосходит текущий Basic mode по business outcome, не повреждает документы и остаётся надёжной на обычных office computers.

До получения таких доказательств Smart Compression остаётся исследовательской гипотезой, а основным доказанным преимуществом продукта остаётся Local Split + Compress in one workflow.

---

## 18. Specification Status

Этот документ:

- **Extends specification conceptually** — предлагает новую Research Program;
- **Requires future specification update** — только если будет принято решение Go;
- не изменяет текущие product requirements;
- не разрешает implementation production feature;
- не меняет существующую нумерацию Phase;
- не заменяет canonical project specification.

Любая будущая реализация должна сначала сверить:

- установленную версию MuPDF и её реальные TypeScript APIs;
- текущую extension architecture;
- canonical product specification;
- существующие Phase reports и acceptance results;
- утверждённые product decisions по signed PDFs, retention и Pro gating.
