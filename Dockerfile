# Canvas Notes: build the client, then run the dependency-free server.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5180 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
VOLUME /data
EXPOSE 5180
USER node
CMD ["node", "server/index.mjs"]
