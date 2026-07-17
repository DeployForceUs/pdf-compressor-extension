# OpenAI API Key Handling

Status: **approved security procedure**  
Scope: Stage 11 Smart Planner server gateway

## Required handling

1. Create a dedicated OpenAI project key for the Build Week deployment.
2. Store it only as the server-side secret named `OPENAI_API_KEY` in the chosen
   deployment platform's secret store.
3. For a local gateway test, export the value only in the terminal process that
   starts the server. Do not place the value in shell history, screenshots,
   issue text, chat, logs, `.env` committed to Git, Dockerfiles, Docker build
   arguments, Extension storage, or client-side environment variables.
4. The Extension calls the authenticated application gateway. Only the gateway
   reads `OPENAI_API_KEY` and sends it in the OpenAI `Authorization` header.
5. Keep `store: false`; do not log request bodies, response bodies, or the
   Authorization header. Retain only redacted status, latency, request
   correlation ID, and fallback reason.
6. Apply a small project budget/rate limit for the contest deployment. Rotate
   the key immediately after suspected exposure and after the temporary judge
   environment is retired.

## Repository safeguards

The repository ignores `.env` and `.env.*` while allowing a future empty
`.env.example`. A key must never be committed, including in test fixtures.

## First real GPT-5.6 roundtrip

The roundtrip may run only after a server runtime has been selected and the
gateway authorization, rate limit, timeout, and request-size policies are
bound. It must use the content-free fixture contract and preserve only redacted
timing/status evidence.

Do not paste the key into an assistant chat. The owner enters it directly into
the deployment platform or local terminal secret environment.
