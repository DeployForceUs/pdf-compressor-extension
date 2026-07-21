FROM node:22-bookworm-slim AS build

WORKDIR /build

COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci

COPY gateway/server.ts ./gateway/server.ts
COPY src/lib/ai/ ./src/lib/ai/
COPY src/lib/office/ ./src/lib/office/

RUN ./node_modules/.bin/esbuild gateway/server.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --target=node22 \
    --outfile=/out/server.mjs

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8790 \
    OPENAI_API_KEY_FILE=/run/secrets/openai_api_key \
    JUDGE_ACCESS_TOKEN_FILE=/run/secrets/judge_access_token

WORKDIR /app

COPY --from=build --chown=node:node /out/server.mjs ./server.mjs
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./

USER node

EXPOSE 8790

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8790/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
