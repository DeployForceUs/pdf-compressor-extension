FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app

COPY --chown=node:node engine/ ./engine/
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./

USER node

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "engine/server.mjs"]
