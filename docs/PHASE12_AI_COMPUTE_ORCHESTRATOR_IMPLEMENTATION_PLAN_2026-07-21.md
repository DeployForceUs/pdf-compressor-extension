Дим, сейчас правильнее всего **зафиксировать один общий pipeline после всех карточек** и больше не строить отдельную логику для каждой цели. Карточки уже только собирают `UserGoal`; всё дальнейшее должно работать одинаково.

## 1. Что уже считается готовым

После выбора PDF у нас формируются два независимых блока.

### `DocumentProfile`

Локальный структурный анализ:

```text
pages
file size
image objects
scanned / text / vector ratio
document complexity signals
```

### `UserGoal`

Каждая карточка собирает только свои параметры:

```text
Send by email
→ target size

Upload to a portal
→ portal size limit

Print
→ standard / high quality

Archive
→ smaller file / preserve quality

Reduce file size
→ light / balanced / maximum

Something else
→ free-text requirement
```

На этом различия между карточками заканчиваются.

---

# Правильная общая последовательность

```text
Upload PDF
↓
Local Analysis
↓
Define Goal
↓
Collect Local Capabilities
+
Probe Office Engine
↓
Build privacy-safe Planner Request
↓
Call AI Planner
↓
Show Recommended Plan
↓
User confirms execution route
↓
Deterministic processing
```

## 2. Что происходит при старте расширения

При открытии popup:

1. Показываем обычный экран `Upload PDF`.
2. Инициализируем WASM и проверяем базовую локальную совместимость.
3. Читаем сохранённый локальный benchmark, если он уже существует.
4. **Не подключаемся к серверу.**
5. **Не запускаем Office Engine job.**
6. **Не вызываем AI.**

То есть старт остаётся быстрым и не зависит от сети.

Сервер на старте приложения опрашивать не надо. Это создаст ненужные запросы при каждом открытии popup и может показывать ошибку сервера ещё до того, как пользователь вообще выбрал документ.

---

## 3. Когда опрашивать локальную машину

После завершения `Local Analysis`, но до вызова AI Planner.

Создаём отдельный модуль:

```text
LocalCapabilityCollector
```

Он собирает:

```json
{
  "logicalCores": 8,
  "memoryClassGb": 8,
  "wasmSupported": true,
  "browserPlatform": "macOS",
  "benchmark": {
    "status": "measured",
    "pagesPerMinute": 14.2,
    "measuredAt": "..."
  }
}
```

### Важный принцип

Не нужно каждый раз запускать полный benchmark.

Правило:

```text
benchmark существует и не устарел
→ используем сохранённый

benchmark отсутствует или версия движка изменилась
→ запускаем короткую калибровку
```

Обычные характеристики вроде количества логических ядер можно обновлять при каждом запросе — это мгновенно.

---

## 4. Когда подключаться к серверу

**После того как пользователь полностью подтвердил цель.**

Например:

```text
Send by email
→ 20 MB
→ начинается orchestration
```

Или:

```text
Print
→ High quality
→ начинается orchestration
```

В этот момент интерфейс показывает настоящий статус:

```text
Preparing document profile…
Checking this device…
Checking Office Engine…
Consulting AI Planner…
```

Extension автоматически делает безопасный запрос:

```text
GET /capabilities
```

Это не запуск обработки и не загрузка PDF. Это только чтение состояния сервера.

Ответ:

```json
{
  "status": "ready",
  "cpuCores": 2,
  "memoryMb": 4096,
  "engineMemoryLimitMb": 3072,
  "queueDepth": 0,
  "maxConcurrentJobs": 1,
  "ghostscriptVersion": "10.00.0",
  "presets": ["safe", "balanced", "strong"],
  "benchmark": {
    "pagesPerMinute": 31.5
  }
}
```

## 5. Сервер не должен запускаться кнопкой на этом этапе

Нужно разделить две вещи:

### Проверка Office Engine

Происходит автоматически перед AI-рекомендацией:

```text
probe capabilities
```

### Реальная обработка на Office Engine

Происходит только после рекомендации и явного подтверждения пользователя:

```text
Process with Office Engine
```

То есть старая логика «сначала нажми кнопку сервера, чтобы узнать, что там» нам больше не нужна.

Правильная модель:

```text
AI автоматически проверяет доступные варианты
→ пользователь подтверждает выбранный маршрут
→ только тогда начинается job
```

Если сервер недоступен, pipeline не падает:

```json
{
  "status": "unavailable",
  "reason": "timeout"
}
```

AI получает эту информацию и строит рекомендацию только на доступных вариантах.

---

# 6. Нормализованный снимок возможностей

После двух опросов создаётся один блок:

```text
ComputeSnapshot
```

```json
{
  "local": {
    "available": true,
    "logicalCores": 8,
    "memoryClassGb": 8,
    "benchmarkPagesPerMinute": 14.2
  },
  "office": {
    "available": true,
    "cpuCores": 2,
    "memoryMb": 4096,
    "queueDepth": 0,
    "benchmarkPagesPerMinute": 31.5
  },
  "recommendedCapacityCatalog": [
    {
      "id": "small",
      "cpuCores": 2,
      "memoryMb": 4096
    },
    {
      "id": "medium",
      "cpuCores": 4,
      "memoryMb": 8192
    },
    {
      "id": "large",
      "cpuCores": 8,
      "memoryMb": 16384
    }
  ]
}
```

`recommendedCapacityCatalog` — не результат опроса Kamatera. Это наш заранее утверждённый справочник конфигураций, между которыми AI имеет право сравнивать.

---

# 7. Что отправляется AI Planner

Не PDF. Не текст. Не filename. Не preview.

Только четыре нормализованных блока:

```json
{
  "documentProfile": {},
  "userGoal": {},
  "localCapabilities": {},
  "officeCapabilities": {},
  "capacityCatalog": []
}
```

Лучше технически хранить их как отдельные типы, а не собирать произвольный огромный объект.

```text
DocumentProfile
UserGoal
LocalCapabilities
OfficeCapabilities
CapacityProfile[]
```

Затем отдельный модуль:

```text
PlannerRequestBuilder
```

валидирует и собирает финальный запрос.

---

# 8. Что должен вернуть AI

Строго structured JSON:

```json
{
  "recommendedRoute": "office_current",
  "recommendedPreset": "balanced",
  "currentLocalAssessment": "sufficient_but_slower",
  "currentOfficeAssessment": "recommended",
  "idealConfiguration": {
    "cpuCores": 4,
    "memoryMb": 8192
  },
  "oversizedConfiguration": {
    "cpuCores": 8,
    "memoryMb": 16384
  },
  "estimatedRuntime": {
    "localSecondsMin": 900,
    "localSecondsMax": 1300,
    "officeSecondsMin": 360,
    "officeSecondsMax": 540
  },
  "explanation": "...",
  "confidence": "medium"
}
```

Важно: AI не должен сам принимать окончательное решение о технической допустимости.

После ответа идёт:

```text
PlannerResponseValidator
```

Он проверяет:

- выбранный preset существует;
- route разрешён;
- конфигурация есть в каталоге;
- нет отрицательных значений;
- сервер действительно доступен;
- не нарушены privacy rules.

---

# 9. Что видит пользователь

После настоящего ожидания появляется:

```text
Recommended Plan

Best route
Current Office Engine

Recommended preset
Balanced

Current configuration
2 vCPU · 4 GB RAM

Ideal configuration for similar workloads
4 vCPU · 8 GB RAM

Larger configuration
8 vCPU · 16 GB RAM would be excessive

Estimated runtime
6–9 minutes

Why
...
```

Затем одна главная кнопка в зависимости от решения:

```text
Process locally
```

или:

```text
Process with Office Engine
```

Именно здесь, а не раньше, начинается фактическая обработка.

---

# 10. Что делать при недоступном сервере

Никакого общего error screen.

```text
Office Engine unavailable
→ AI анализирует локальную машину
→ выдаёт локальную рекомендацию
→ сообщает, какая серверная конфигурация была бы подходящей
```

Например:

```text
Office Engine could not be reached.

This device can complete the job locally.
Estimated runtime: 22–31 minutes.

Recommended Office Engine configuration for similar jobs:
4 vCPU · 8 GB RAM.
```

Возможность повторной проверки:

```text
Check Office Engine again
```

Но это вторичная кнопка, не обязательная часть основного маршрута.

---

# 11. Инженерные модули

Чтобы не запутаться, делим систему именно так:

```text
1. GoalNormalizer
2. LocalCapabilityCollector
3. OfficeCapabilityClient
4. CapacityCatalog
5. PlannerRequestBuilder
6. AiPlannerClient
7. PlannerResponseValidator
8. RecommendationPresenter
9. ExecutionRouter
```

Каждый модуль имеет одну ответственность.

AI не должен:

- напрямую опрашивать браузер;
- напрямую ходить на Office Engine;
- видеть credentials;
- выбирать неизвестные конфигурации;
- запускать обработку;
- менять сервер.

AI получает уже проверенные данные и возвращает план.

---

# 12. Правильный порядок нашей разработки

## Блок A — зафиксировать контракты

Сначала описываем TypeScript-типы:

```text
UserGoal
LocalCapabilities
OfficeCapabilities
CapacityProfile
PlannerRequest
PlannerResponse
```

Пока без UI-изменений.

## Блок B — локальный collector

Собираем:

- logical cores;
- memory class;
- WASM availability;
- сохранённый benchmark;
- benchmark status.

Выводим результат только в debug/preflight.

## Блок C — endpoint сервера

Добавляем или нормализуем:

```text
GET /capabilities
```

Проверяем отдельно через `curl`.

## Блок D — общий orchestrator без OpenAI

После выбора любой карточки он:

```text
collect local
+
fetch office
+
build PlannerRequest
```

И временно выводит собранный объект в debug.

Так мы доказываем, что все шесть веток приходят в одинаковую точку.

## Блок E — настоящий AI Planner

Подключаем один вызов для всех целей.

Добавляем:

- loading statuses;
- timeout;
- retry;
- structured output;
- response validation.

## Блок F — общий Recommendation screen

Удаляем локальные мгновенные шаблоны и показываем реальный ответ Planner.

## Блок G — ExecutionRouter

После подтверждения:

```text
local → существующий local engine
office → существующий Office Engine
```

## Блок H — preflight и demo fixture

Проверяем:

- лёгкий текстовый PDF;
- средний смешанный PDF;
- тяжёлый scanned PDF;
- сервер доступен;
- сервер недоступен;
- Planner timeout;
- malformed Planner response.

---

# Наш ближайший конкретный маршрут

Завтра после smoke test текущего интерфейса:

```text
Шаг 1
Зафиксировать TypeScript contracts

Шаг 2
Сделать LocalCapabilityCollector

Шаг 3
Сделать Office /capabilities

Шаг 4
Собрать общий ComputeSnapshot

Шаг 5
Подключить единый Orchestrator ко всем шести карточкам

Шаг 6
Только затем подключать OpenAI
```

Главное архитектурное решение:

> **Сервер не опрашивается при открытии расширения и не запускается отдельной кнопкой. Он автоматически и безопасно проверяется после подтверждения цели. Реальная серверная обработка начинается только после AI-рекомендации и подтверждения пользователя.**

Так pipeline будет быстрым на старте, устойчивым при отсутствии сети и одинаковым для всех шести веток.