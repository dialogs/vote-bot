/*
 * Copyright 2017 dialog LLC <info@dlg.im>
 */

const Raven = require('raven');
const Promise = require('bluebird');
const uuid = require('uuid/v4');
const Bot = require('./Bot');
const config = require('./config');

Raven.config(config.sentry.dsn).install();

const bot = new Bot({
  quiet: false,
  endpoints: [config.bot.endpoint],
  username: config.bot.username,
  password: config.bot.password
});

function formatMessage(question, yes, no, membersCount) {
  const all = yes + no;

  return `${question}

*Зарегистрировано*: ${membersCount} человек
*Проголосовало*: ${all}.

*Да*: ${(all === 0 ? 0 : yes / all * 100).toFixed()}% (${yes}).
*Нет*: ${(all === 0 ? 0 : no / all * 100).toFixed()}% (${no}).`;
}

function createVoteActions(id) {
  return [
    {
      actions: [
        {
          id: `${id}:vote_yes`,
          widget: {
            type: 'button',
            label: 'Да',
            value: 'yes'
          }
        },
        {
          id: `${id}:vote_no`,
          widget: {
            type: 'button',
            label: 'Нет',
            value: 'no'
          }
        }
      ]
    }
  ];
}

async function run() {
  await Promise.delay(10000);

  console.log('start');

  await bot.sendTextMessage(
    { type: 'user', id: config.bot.adminId },
    `
Привет! Я только запустился, но уже готов к работе.
Чтобы создать опрос, напиши мне сообщение.
Учти, я могу обрабатывать только один опрос за раз.`
  );

  let groups = [];
  const state = new Map();

  await bot.bindGroups(nextGroups => {
    groups = nextGroups;
  });

  const messenger = await bot.ready;

  bot.onInteractiveEvent(async event => {
    const [id, action] = event.id.split(':');
    const survey = state.get(id);
    if (!survey) {
      return;
    }

    switch (action) {
      case 'cancel':
        survey.isCancelled = true;
        await bot.editInteractiveMessage(
          event.peer,
          event.rid,
          'Опрос отменен.',
          []
        );
        if (survey.message) {
          await bot.editInteractiveMessage(
            survey.message.peer,
            survey.message.rid,
            'Опрос отменен.',
            []
          );
        }
        break;

      case 'select_group':
        const groupId = parseInt(event.value, 10);
        survey.group = groups
          .filter((gid) => gid === groupId)
          .map((gid) => messenger.getGroup(gid))
          .find((group) => group.type === 'group' && group.canSendMessage !== false);

        if (!survey.group) {
          await bot.editInteractiveMessage(event.peer, event.rid, 'Группа не найдена', []);
          break;
        }

        await bot.editInteractiveMessage(
          event.peer,
          event.rid,
          'Опрос запущен.',
          [
            {
              description: 'Вы можете в любой момент остановить, или отменить опрос.',
              actions: [
                {
                  id: `${id}:stop`,
                  style: 'primary',
                  widget: {
                    type: 'button',
                    label: 'Остановить',
                    value: 'stop'
                  }
                },
                {
                  id: `${id}:cancel`,
                  style: 'danger',
                  widget: {
                    type: 'button',
                    label: 'Отменить',
                    value: 'cancel'
                  },
                  confirm: {
                    title: 'Отмена опроса',
                    text: 'Вы уверены, что хотите завершить опрос?',
                    yes: 'Yes',
                    dismiss: 'No'
                  }
                }
              ]
            }
          ]
        );
        await bot.sendInteractiveMessage(
          {
            id: groupId,
            type: 'group'
          },
          formatMessage(survey.question, survey.yes.size, survey.no.size, survey.group.members.length),
          createVoteActions(id)
        );
        break;

      case 'vote_no':
        if (survey.group) {
          survey.no.add(event.uid);
          survey.yes.delete(event.uid);
          survey.message = { rid: event.rid, peer: event.peer };
          await bot.editInteractiveMessage(
            event.peer,
            event.rid,
            formatMessage(survey.question, survey.yes.size, survey.no.size, survey.group.members.length),
            createVoteActions(id)
          );
        }
        break;

      case 'vote_yes':
        if (survey.group) {
          survey.yes.add(event.uid);
          survey.no.delete(event.uid);
          survey.message = { rid: event.rid, peer: event.peer };
          await bot.editInteractiveMessage(
            event.peer,
            event.rid,
            formatMessage(survey.question, survey.yes.size, survey.no.size, survey.group.members.length),
            createVoteActions(id)
          );
        }
        break;

      case 'stop':
        if (survey.group) {
          await bot.editInteractiveMessage(
            event.peer,
            event.rid,
            formatMessage(survey.question, survey.yes.size, survey.no.size, survey.group.members.length),
            []
          );

          if (survey.message) {
            await bot.editInteractiveMessage(
              survey.message.peer,
              survey.message.rid,
              formatMessage(survey.question, survey.yes.size, survey.no.size, survey.group.members.length),
              []
            );
          }
        }

        break;
    }
  });

  bot.onMessage(async (peer, message) => {
    const { content } = message;
    if (peer.type === 'user') {
      if (content.type !== 'text') {
        await bot.sendTextMessage(peer, 'Я понимаю только текст =(');
        return;
      }

      const id = uuid();
      state.set(id, {
        id,
        message: null,
        question: content.text.trim(),
        yes: new Set(),
        no: new Set()
      });

      const messenger = await bot.ready;

      await bot.sendInteractiveMessage(peer, 'Отличный вопрос.', [
        {
          description: 'В какой группе запустить опрос?',
          actions: [
            {
              id: `${id}:select_group`,
              widget: {
                type: 'select',
                label: 'Группа...',
                options: groups
                  .map((gid) => messenger.getGroup(gid))
                  .filter((group) => group.type === 'group')
                  .filter((group) => group.canSendMessage !== false)
                  .filter(group => {
                    const index = group.members.findIndex((member => member.peerInfo.peer.id === message.sender.peer.id));
                    return index >= 0
                  })
                  .map(group => {
                    return {
                      label: group.name,
                      value: String(group.id)
                    };
                  })
              }
            },
            {
              id: `${id}:cancel`,
              widget: {
                type: 'button',
                label: 'Отменить',
                value: 'cancel'
              }
            }
          ]
        }
      ]);
    }
  });
}

function onError(error) {
  Raven.captureException(error, (sendError) => {
    if (sendError) {
      console.error(sendError);
    }
  });

  console.trace(error);
  process.exit(1);
}

run().catch(onError);
bot.on('error', onError);
