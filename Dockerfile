FROM node:20-slim

# İş sahəsini təyin et
WORKDIR /app

# Asılılıqları kopyala və yüklə
COPY package*.json ./
RUN npm install --production

# Bütün faylları kopyala
COPY . .

# Botu işə sal
CMD ["node", "index.js"]
