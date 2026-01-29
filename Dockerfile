# LearnSnap Production Dockerfile

FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies for sharp prebuilt binaries
RUN apk add --no-cache vips

# Install build tools for bcrypt (sharp will use prebuilt)
RUN apk add --no-cache python3 make g++

# Set sharp to use prebuilt binaries
ENV npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"
ENV npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"

# Copy package files
COPY package*.json ./

# Install dependencies with force to use prebuilt binaries
RUN npm install --legacy-peer-deps --ignore-scripts && \
    npm rebuild bcrypt --build-from-source && \
    npm rebuild sharp

# Copy source files
COPY script ./script
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.cjs ./
COPY drizzle.config.ts ./
COPY client ./client
COPY server ./server
COPY shared ./shared

# Build the application
RUN npm run build

# Clean up build tools
RUN npm prune --omit=dev && \
    apk del python3 make g++ && \
    rm -rf /root/.npm /tmp/* client/src server/*.ts shared/*.ts

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 learnsnap && \
    chown -R learnsnap:nodejs /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Switch to non-root user
USER learnsnap

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health/live || exit 1

# Start command
CMD ["node", "dist/index.cjs"]
