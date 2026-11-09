# Builder stage: Install dependencies and build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (npm cache is reused across builds)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

# Build application
COPY . .
RUN npm run build

# Runner stage: Production image with minimal dependencies
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5050
ENV OPTIC_PYTHON=/usr/bin/python3

# Optical reading needs Python + OpenCV
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-opencv python3-numpy \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (same npm cache as the builder stage)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --no-audit --no-fund

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/optical_processor.py ./server/optical_processor.py

# Ensure SQLite directory exists even when repository has no db folder
RUN mkdir -p /app/db

EXPOSE 5050

CMD ["npm", "start"]
