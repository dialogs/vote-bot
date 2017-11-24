function isContentOk(content) {
  const types = ['document', 'photo', 'voice', 'video'];
  if (types.includes(content.type)) {
    return Boolean(content.fileUrl);
  }

  return true;
}

function checkMessage(message) {
  if (message) {
    if (isContentOk(message.content)) {
      if (message.attachment) {
        if (message.attachment.messages.every(checkMessage)) {
          return true;
        } else {
          return false;
        }
      } else {
        return true;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

class ResolveMessageQueue {
  constructor(messenger) {
    this.queue = [];
    this.messenger = messenger;
  }

  dequeue() {
    setImmediate(() => {
      const fn = this.queue.shift();
      if (fn) {
        fn(this.messenger);
      }
    });
  }

  add(peer, mid, callback) {
    this.queue.push(messenger => {
      messenger.onConversationOpen(peer);
      let binding = messenger.bindMessages(peer, messages => {
        try {
          const full = messages.find(item => item.mid === mid);
          if (checkMessage(full)) {
            messenger.onConversationClosed(peer);
            if (binding) {
              binding.unbind();
              binding = null;
            }

            callback(null, full);
            this.dequeue();
          }
        } catch (error) {
          callback(error);
          if (binding) {
            binding.unbind();
            binding = null;
          }
        }
      });

      binding.initAll();
    });

    this.dequeue();
  }
}

module.exports = ResolveMessageQueue;
