FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
COPY bun.lockb ./
COPY ./src ./src
COPY index.ts ./

RUN bun install --production

USER bun
ENTRYPOINT [ "bun", "run", "index.ts" ]