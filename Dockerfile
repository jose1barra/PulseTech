FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/.private && chown node:node /app/.private
COPY --chown=node:node . .
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 DATA_DIR=/app/.private
EXPOSE 5173
CMD ["node", "server.mjs"]
