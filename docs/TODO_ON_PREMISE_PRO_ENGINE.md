# TODO — On-Premise Pro Compression Engine

> **Roadmap note:** This is post-release canonical Stage 11 exploration. Its Phase A-D labels are internal On-Premise subphases and are unrelated to the product's canonical numbered stages. See [`PHASE_ROADMAP.md`](./PHASE_ROADMAP.md).

## Цель

Добавить к браузерному расширению второй, более мощный режим сжатия PDF, работающий внутри инфраструктуры клиента.

Локальный browser engine остаётся основным режимом для повседневной работы и полной offline-приватности. On-Premise engine используется для более тяжёлых сценариев: сильное lossy compression, большие PDF, batch processing и target-size compression.

## Продуктовая концепция

После установки клиентского контейнера в popup появляется новый раздел, которого нет в обычной версии расширения:

- **Pro Compression Engine**
- **Enterprise Engine**
- **Maximum Compression**
- **On-Premise Engine**

В пользовательском интерфейсе не использовать слово `Ghostscript` как основной product label. Название `Ghostscript` показывать только внутри `Technical Details`.

Пример пользовательской подачи:

- **Local Engine** — fast, private, works offline
- **Pro Engine** — maximum compression on your own server
- **Files never leave your network**

## Базовая архитектура

```text
Chrome Extension
        ↓ HTTPS
Internal API
        ↓
Compression Worker
        ↓
Ghostscript + ImageMagick
        ↓
Local storage / MinIO
```

Ghostscript устанавливается не на устройство конечного пользователя вручную, а входит в готовый Docker Image.

Типовые варианты размещения:

- Linux server в офисе
- VM в VMware / Hyper-V / Proxmox
- private cloud / VPC
- Kubernetes cluster
- выделенный workstation для малого бизнеса

## Starter Pack

Клиент скачивает с сайта готовый пакет:

```text
docker-compose.yml
.env.example
install.sh
update.sh
README.md
license.key
```

Минимальный запуск:

```bash
cp .env.example .env
docker compose up -d
```

Внутри Docker Image должны быть:

- Ghostscript
- ImageMagick
- Internal API
- Compression Worker
- health-check
- license validation
- preset configuration
- temporary-file cleanup
- logging
- optional MinIO / Redis

## Минимальная конфигурация клиента

```env
LICENSE_KEY=...
PUBLIC_URL=https://pdf-compressor.company.local
MAX_FILE_SIZE_MB=500
DATA_RETENTION_MINUTES=60
```

Желательно свести onboarding к шагам:

1. Купить лицензию.
2. Скачать Starter Pack.
3. Запустить одну команду.
4. Открыть admin page.
5. Скопировать internal URL.
6. Подключить URL в extension или раздать через Chrome Enterprise Policy.

## Подключение из popup

Добавить кнопку:

```text
Connect Pro Engine
```

Wizard подключения:

1. Server URL
2. License Key
3. Test Connection
4. Connected

После успешного подключения показывать:

```text
Pro Engine
Connected
Server: Healthy
Latency: 18 ms
Storage: Local
```

В `Technical Details` можно показывать:

```text
Ghostscript 10.x
ImageMagick 7.x
API version
Worker version
Health status
```

## Новые режимы после подключения

После успешного подключения Pro Engine в popup появляются новые возможности:

- Maximum Compression
- Target Size
- Archive preset
- Print preset
- Screen preset
- Large Files
- Batch Compression
- optional OCR / advanced image processing

Локальные режимы при этом остаются доступны:

- Light
- Balanced
- Strong

## Поведение при недоступности сервера

Если Pro Engine недоступен:

```text
Pro Engine unavailable
Using Local Engine
```

Требования:

- graceful fallback
- без потери выбранного файла
- без crash popup
- понятная ошибка connection / license / timeout
- возможность Retry
- возможность Disconnect

## Безопасность и приватность

- Файл не должен покидать сеть клиента.
- Соединение только по HTTPS.
- Поддержать self-signed certificate или documented enterprise CA flow.
- Ограничить размер файлов.
- Добавить timeout и cancellation.
- Временные файлы удалять автоматически.
- Не логировать содержимое PDF.
- Не отправлять filename, document metadata или content в публичную аналитику.
- License validation должна поддерживать offline grace period.

## API contract — черновик

### Health

```http
GET /api/v1/health
```

Ответ:

```json
{
  "status": "healthy",
  "engine": "ghostscript",
  "engineVersion": "10.x",
  "apiVersion": "1.0",
  "maxFileSizeMb": 500
}
```

### Compress

```http
POST /api/v1/compress
Content-Type: multipart/form-data
```

Параметры:

- file
- preset
- targetSizeMb optional
- grayscale optional
- preserveMetadata optional

### Status

```http
GET /api/v1/jobs/{jobId}
```

### Download

```http
GET /api/v1/jobs/{jobId}/result
```

### Cancel

```http
POST /api/v1/jobs/{jobId}/cancel
```

## Presets — предварительно

### Screen

- 96–120 DPI
- JPEG quality 45–55
- aggressive downsampling

### Balanced

- 144–180 DPI
- JPEG quality 65–75
- preserve readability

### Print

- 220–300 DPI
- JPEG quality 80–90
- minimal visible degradation

### Archive

- conservative rewrite
- preserve metadata by policy
- no destructive transformations unless explicitly enabled

### Target Size

Итеративный режим:

```text
first pass
→ measure result
→ reduce quality / DPI if needed
→ repeat
→ stop within tolerance
```

## UI / UX

Основной popup должен оставаться компактным.

Production layout:

- основной flow для обычного пользователя
- `Advanced details` collapsed по умолчанию
- technical diagnostics скрыты
- Developer Mode отдельным флагом

В компактном режиме показывать только:

- выбранный файл
- выбранный engine
- выбранный preset
- progress
- result size
- download button

В расширенном режиме показывать:

- engine status
- server health
- latency
- original/compressed bytes
- page count
- image statistics
- skipped objects
- warning reasons
- Retry / Reset / Disconnect

## Chrome Enterprise Policy

Добавить возможность централизованной конфигурации:

- internal server URL
- license key или license token reference
- allowed presets
- max file size
- data retention policy
- force On-Premise only
- disable public endpoints

## Licensing

Starter Pack / Enterprise варианты:

- signed license file
- JWT verification
- offline grace period
- seat or organization limits
- optional activation count
- optional server fingerprint

Для MVP On-Premise не усложнять license flow без необходимости.

## Observability

Минимум:

- health-check
- structured logging
- processing duration
- queue depth
- success/failure count
- disk usage
- cleanup status

Не логировать PDF content.

## Deployment levels

### Small Business

- single Docker Compose
- API + Worker + Ghostscript in one service
- local volume

### Mid-Market

- API service
- Worker service
- Redis Queue
- MinIO
- reverse proxy

### Enterprise

- Kubernetes
- multiple Workers
- autoscaling
- private registry
- enterprise CA
- centralized logging / monitoring

## Acceptance criteria

- Container запускается одной командой.
- Health endpoint возвращает healthy.
- Extension подключается по internal URL.
- Pro Engine появляется только после успешного connection test.
- PDF compresses через Ghostscript.
- Result file opens correctly.
- Page count сохраняется.
- Temporary files удаляются.
- При недоступности сервера extension переключается на Local Engine.
- Никакие файлы не уходят во внешнюю сеть.

## Roadmap

### Phase A — Technical Spike

- minimal API
- Ghostscript container
- one preset
- one-file flow
- health endpoint

### Phase B — Extension Integration

- connection wizard
- engine status
- upload / progress / download
- fallback to Local Engine

### Phase C — Productization

- installer / install.sh
- license validation
- admin page
- update flow
- logs and support bundle

### Phase D — Enterprise

- Chrome Enterprise Policy
- batch processing
- queue
- MinIO
- Kubernetes deployment

## Открытые вопросы

- Нужен ли Redis в Starter Pack или достаточно synchronous processing?
- Нужен ли MinIO для первой версии?
- Какая license model: perpetual, annual support или subscription?
- Нужен ли Target Size в первой версии?
- Какие presets должны быть доступны по умолчанию?
- Как обрабатывать self-signed TLS certificates?
- Нужен ли offline installer для air-gapped клиентов?
- Нужен ли Windows Server deployment или только Linux Docker?

## Связь с текущей спецификацией

Текущий browser MVP использует MuPDF.js и выполняет локальную обработку.

On-Premise mode является дополнительной конфигурацией того же расширения:

```text
Local mode → MuPDF WASM
Pro mode   → Internal API → Ghostscript Container
```

Это не отдельный fork продукта.

## Статус

- [ ] Подтвердить product naming
- [ ] Согласовать API contract
- [ ] Собрать minimal Ghostscript Docker Image
- [ ] Реализовать `/health`
- [ ] Реализовать один compression preset
- [ ] Добавить connection wizard в extension
- [ ] Добавить graceful fallback
- [ ] Добавить license validation
- [ ] Подготовить Docker Compose Starter Pack
- [ ] Подготовить installation guide
- [ ] Провести local network acceptance test
