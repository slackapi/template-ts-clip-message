/* eslint-disable @typescript-eslint/camelcase */
import dotenv from 'dotenv';
dotenv.config();

import { App, MessageShortcut } from '@slack/bolt'
import { KnownBlock } from '@slack/types'
import { createConnection, RowDataPacket } from "mysql2/promise";

const botToken = process.env.BOT_TOKEN;

const app = new App({
    signingSecret: process.env.SIGNING_SECRET,
    token: botToken
});

const databaseConfig = {
    host: process.env.DB_HOSTNAME,
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD
}

async function insertClipIntoDB(userID: string, messageTS: string, channelID: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
        const connection = await createConnection(databaseConfig);

        connection.execute(
            'INSERT INTO clippings SET user_id = ?, message_ts = ?, channel_id = ?, created = ?',
            [
                userID,
                messageTS,
                channelID,
                new Date()
            ]
        ).then(() => {
            resolve(true);
        }
        ).catch((error) => {
            reject(error)
        });

    })
}

async function getClipsForUser(userID: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
        const connection = await createConnection(databaseConfig);

        connection.query(
            'SELECT user_id, message_ts, channel_id from clippings where user_id = ?',
            [
                userID,
            ]
        ).then(async ([rows]) => {
            const results = rows as RowDataPacket;
            resolve(results);
        }
        ).catch((error) => {
            reject(error)
        });

    })
}

app.shortcut('clip_message', async ({ shortcut, context, ack }) => {
    await ack();
    const messageShortcut = shortcut as MessageShortcut;
    insertClipIntoDB(messageShortcut.user.id, messageShortcut.message_ts, messageShortcut.channel.id).then(() => {
        app.client.views.open({
            token: context.botToken,
            view: {
                type: 'modal',
                title: {
                    type: 'plain_text',
                    text: 'Message clipped',
                    emoji: true,
                },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'plain_text',
                            text: 'We\'ve clipped the message for you to read later!',
                            emoji: true,
                        },
                    },
                ],
            },
            trigger_id: messageShortcut.trigger_id
        })
    }).catch(() => {
        app.client.views.open({
            token: context.botToken,
            view: {
                type: 'modal',
                title: {
                    type: 'plain_text',
                    text: 'Something went wrong',
                    emoji: true,
                },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'plain_text',
                            text: `We're sorry, but we couldn't clip that message. Please try again.`,
                            emoji: true,
                        },
                    },
                ],
            },
            trigger_id: messageShortcut.trigger_id
        })

    });
});

app.event('app_home_opened', async ({ event, context }) => {
    console.log(event);
    console.log(context);
    const clips = await getClipsForUser(event.user);
    console.log(clips[0]);
    const clippings: KnownBlock[] = [];
    for (const clipping of clips) {
        const convo = await app.client.conversations.history({
            token: context.botToken,
            channel: clipping['channel_id'],
            inclusive: true,
            limit: 1,
            latest: clipping['message_ts']
        });
        clippings.push(
            {
                type: 'section',
                text: {
                    type: 'plain_text',
                    text: convo.messages[0].text,
                    emoji: true,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `This message from <@${convo.messages[0].user}> was clipped from <#${clipping['channel_id']}>`,
                    },
                ],
            },
        );
    }

    app.client.views.publish({
        token: context.botToken,
        user_id: event.user,
        view: {
            type: 'home',
            blocks: clippings,
        }
    });
});



(async (): Promise<void> => {
    // Start your app
    await app.start(process.env.PORT || 3000);
    console.log('Bolt is ready and waiting...');
})();