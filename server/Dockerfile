FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
VOLUME /data
ENV DB_PATH=/data/wanderoot.db PORT=3000
EXPOSE 3000
CMD ["node", "dist/main.js"]
