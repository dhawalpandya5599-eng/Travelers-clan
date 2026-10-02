FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 OYE_DATA=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
