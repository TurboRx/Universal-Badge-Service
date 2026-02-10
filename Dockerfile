FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY api ./api
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/api/index.js ./api/index.js
COPY --from=build /app/api/index.js.map ./api/index.js.map
EXPOSE 3000
CMD ["node", "api/index.js"]
