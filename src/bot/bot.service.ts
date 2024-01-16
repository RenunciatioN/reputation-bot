import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, Reputation } from '@prisma/client';

import TelegramBot = require('node-telegram-bot-api');
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class BotService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() {
    await this.botMessage();
  }

  async botMessage() {
    const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

    const thanksWords = [
      'спасибо',
      'спс',
      '+реп',
      'гуд',
      'good',
      'благодарю',
      '👍',
    ];

    bot.on('new_chat_members', (msg) =>
      bot.sendMessage(
        msg.chat.id,
        `Привет ${msg.new_chat_members[0].first_name}`,
      ),
    );
    bot.on('left_chat_member', async (msg) => {
      await this.removeReputation(String(msg.left_chat_member.id));

      bot.sendMessage(msg.chat.id, 'wwww');
    });

    bot.on('message', async (msg) => {
      if (!msg?.reply_to_message) return;

      const user = await bot.getChatMember(
        msg.chat.id,
        msg.reply_to_message.from.id,
      );

      if (user.status === 'left') return;

      if (msg?.sticker && msg.sticker.emoji === '👍') {
        return this.handleThanksWordReaction(msg, bot);
      }

      if (
        msg.reply_to_message.from.username === 'reputation21bot' ||
        msg.reply_to_message.from.username === msg.from.username
      ) {
        return;
      }

      const thanksWord = msg.text
        .toLowerCase()
        .split(' ')
        .find((word) =>
          thanksWords.includes(word.replace(/[&\/\\#,+()$~%.'":*?!<>{}]/g, '')),
        );

      if (thanksWord) {
        this.handleThanksWordReaction(msg, bot);
      }
    });
  }
  async getAllReputations(): Promise<Reputation[]> {
    return await this.prisma.reputation.findMany();
  }

  async getReputation(telegramId: string): Promise<Reputation> {
    return await this.prisma.reputation.findFirst({
      where: { telegramId },
    });
  }
  async updateReputation(reputation: number, id: number): Promise<void> {
    await this.prisma.reputation.update({
      where: { id },
      data: { reputation },
    });
  }
  async addNewReputation(data: Prisma.ReputationCreateInput): Promise<void> {
    await this.prisma.reputation.create({ data });
  }
  async sendReputationMessage(
    chatId: number,
    replyUsername: string,
    fromUsername: string,
    bot: TelegramBot,
    telegramId: string,
  ): Promise<void> {
    const reputationData = await this.getReputation(telegramId);

    bot.sendMessage(
      chatId,
      `Поздравляю @${replyUsername}
      \nУчастник @${fromUsername} повысил твою репутацию! \nТвоя репутация ${reputationData.reputation}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Статистика чата',
                url: 'https://google.com',
              },
            ],
          ],
        },
      },
    );
  }

  async increaseReputation(
    telegramId: string,
    username: string,
    fullName: string,
    userAvatar: string,
  ) {
    const reputationData = await this.getReputation(telegramId);

    if (reputationData) {
      await this.updateReputation(
        reputationData.reputation + 1,
        reputationData.id,
      );

      return;
    }

    await this.addNewReputation({
      telegramId,
      username,
      userAvatar,
      fullName,
      reputation: 1,
    });
  }

  async removeReputation(telegramId: string) {
    const user = await this.prisma.reputation.findFirst({
      where: { telegramId },
    });

    if (!user) return;
    await this.prisma.reputation.delete({ where: { id: user.id } });
  }

  async handleThanksWordReaction(msg: TelegramBot.Message, bot: TelegramBot) {
    const telegramId = String(msg.reply_to_message.from.id);
    const userAvatar = await this.getUserAvatarUrl(
      msg.reply_to_message.from.id,
      bot,
    );

    await this.increaseReputation(
      telegramId,
      msg.reply_to_message.from.username || '',
      msg.reply_to_message.from.first_name || '',
      userAvatar,
    );

    await this.sendReputationMessage(
      msg.chat.id,
      msg.reply_to_message.from.username || '',
      msg.from.username || '',
      bot,
      telegramId,
    );
  }

  async getUserAvatarUrl(userId: number, bot: TelegramBot) {
    const userProfile = await bot.getUserProfilePhotos(userId);

    if (!userProfile.photos.length) {
      return '';
    }

    const fileId = userProfile.photos[0][0].file_id;
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;

    return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
  }
}
