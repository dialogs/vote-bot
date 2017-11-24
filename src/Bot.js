/*
 * Copyright 2017 dialog LLC <info@dlg.im>
 */

const { Bot } = require('@dlghq/dialog-node-client');
const ResolveMessageQueue = require('./ResolveMessageQueue');

class CoopBot extends Bot {
  constructor(...args) {
    super(...args);

    this.ready.then((messenger) => {
      this.messageQueue = new ResolveMessageQueue(messenger);
    });
  }

  async sendTextMessage(peer, message) {
    const messenger = await this.ready;
    messenger.onConversationOpen(peer);
    messenger.sendMessage(peer, message);
    messenger.onConversationClosed(peer);
  }

  async readChat(peer) {
    const messenger = await this.ready;
    messenger.onConversationOpen(peer);
    messenger.onConversationClosed(peer);
  }

  async bindGroups(callback) {
    const messenger = await this.ready;

    messenger.bindDialogs((dialogs) => {
      const groups = dialogs
        .filter((dialog) => dialog.info.peer.type === 'group')
        .map((dialog) => dialog.info.peer.id);

      callback(groups);
    });
  }

  onMessage(callback) {
    this.onAsync('MESSAGE_ADD', async ({ peer, mid, sender }) => {
      const messenger = await this.ready;
      if (sender === messenger.getUid()) {
        return;
      }

      this.messageQueue.add(peer, mid, (error, message) => {
        if (error) {
          this.emit('error', error);
        } else if (message) {
          callback(peer, message).catch(error => this.emit('error', error));
        }
      });
    });
  }
}

module.exports = CoopBot;
