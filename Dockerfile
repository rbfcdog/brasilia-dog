FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/api

COPY --chown=node:node api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node api/src ./src
USER node

EXPOSE 3000
CMD ["npm", "start"]
