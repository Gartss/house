FROM node:22-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p /data
COPY docker-entrypoint.sh /usr/local/bin/house-entrypoint
RUN chmod +x /usr/local/bin/house-entrypoint
EXPOSE 3000
ENTRYPOINT ["house-entrypoint"]
