FROM oven/bun:1.3.8-alpine AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./
RUN bun build --compile --minify --target=bun src/index.ts --outfile=dist/server

# Minimal runtime image — just the binary
FROM alpine:3.21 AS release
WORKDIR /app

COPY --from=build /app/dist/server ./server

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["./server"]
