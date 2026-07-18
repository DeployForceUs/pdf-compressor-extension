FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8787 \
    ENGINE_WORK_ROOT=/var/lib/pdf-office-engine/jobs

RUN apt-get update \
 && apt-get install --yes --no-install-recommends ghostscript poppler-utils \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -o node -g node -m 700 /var/lib/pdf-office-engine/jobs

WORKDIR /app

COPY --chown=node:node engine/ ./engine/
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./

USER node

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "engine/server.mjs"]
