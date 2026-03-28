FROM node:20-slim
WORKDIR /app

# Install all deps (dev included — Vite is a dev dep).
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html    ./
COPY vite.config.js ./
COPY src           ./src

EXPOSE 5173
# --host binds Vite to 0.0.0.0 so the container port is reachable from the host.
CMD ["npm", "run", "dev", "--", "--host"]
