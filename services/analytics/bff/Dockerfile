FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server.js ./
USER node
EXPOSE 8080
CMD ["node", "server.js"]
