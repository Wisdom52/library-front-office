FROM node:20-alpine

WORKDIR /app

# Install dependencies first for efficient docker layer caching
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Ensure signatures directory exists
RUN mkdir -p /app/signatures

EXPOSE 3000

CMD ["node", "server/index.js"]
