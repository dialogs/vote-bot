FROM mhart/alpine-node:8.6

ENV NODE_ENV production

WORKDIR /opt/coop-vote-bot
COPY . .

ENTRYPOINT ["node", "src/index.js"]
