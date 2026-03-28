FROM node:20-slim
WORKDIR /app

# Install production deps only; layer-cached until package-lock changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001
CMD ["node", "src/index.js"]
