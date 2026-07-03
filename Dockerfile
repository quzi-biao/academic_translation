FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pandoc python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY server/package.json ./server/package.json
RUN cd server && npm install
COPY admin-frontend/package.json ./admin-frontend/package.json
RUN cd admin-frontend && npm install
COPY web-app/package.json ./web-app/package.json
RUN cd web-app && npm install

FROM deps AS build
COPY . .
RUN cd server && npx prisma generate
RUN cd admin-frontend && npm run build
RUN cd web-app && npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pandoc ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app .
WORKDIR /app/server
EXPOSE 7000
CMD ["npm", "start"]
