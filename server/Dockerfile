# RentMate OCR Express server
# 注意：build context 必須是專案根目錄（server/ 會 import ../shared/），
# compose 已設定 context: . / dockerfile: server/Dockerfile
FROM node:22-slim

WORKDIR /app

# package.json 是前後端共用的，--omit=dev 只裝 runtime 依賴
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY shared ./shared

EXPOSE 8787

CMD ["node", "server/index.js"]
