# Builder stage: Install dependencies and build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build application
COPY . .
RUN npm run build

# Runner stage: Production image with minimal dependencies
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built application and database from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db

EXPOSE 5000

CMD ["npm", "start"]
