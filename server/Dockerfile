FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
