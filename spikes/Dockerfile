FROM node:24-bookworm-slim
WORKDIR /spike
COPY package.json crosslang.mjs ./
COPY out/crossref-sample.json out/
RUN npm install --no-save @huggingface/transformers better-sqlite3 sqlite-vec
CMD ["node", "crosslang.mjs"]
