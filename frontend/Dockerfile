FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
# Dùng serve để chạy app React build
RUN npm install -g serve
EXPOSE 3000
CMD ["npm", "start"]
