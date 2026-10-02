FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/processor/package.json apps/processor/package.json
COPY apps/ingest/package.json apps/ingest/package.json
COPY apps/emulator/package.json apps/emulator/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.base.json
COPY packages/contracts packages/contracts
COPY apps/emulator apps/emulator

WORKDIR /app/apps/emulator

CMD ["pnpm", "start"]
