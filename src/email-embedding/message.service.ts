import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PrismaServicePrimary } from './prisma.service';

@Injectable()
export class InsertMessages {
  private readonly logger = new Logger(InsertMessages.name);

  constructor(
    private readonly prismaReadOnly: PrismaService,
    private readonly prismaPrimary: PrismaServicePrimary,
  ) {}

  insertEmails = async () => {
    try {
      const messages = await this.prismaReadOnly.primary.message.findMany();

      this.logger.log(`Found ${messages.length} messages to insert`);

      const batchSize = 1000;
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        const processedBatch = batch
          .map((message) => {
            return {
              ms_message_id: message.ms_message_id,
              subject: message.subject,
              sender_name: message.sender_name,
              sender_email: message.sender_email,
              received_date_time: message.received_date_time,
              sent_date_time: message.sent_date_time,
              body: message.body,
              body_preview: message.body_preview,
              recipients: message.recipients,
              cc_recipients: message.cc_recipients,
              bcc_recipients: message.bcc_recipients,
              reply_to: message.reply_to,
              has_attachments: message.has_attachments,
              summary: message.summary,
              meta_data: message.meta_data,
              source_id: message.source_id,
              created_at: message.created_at,
              last_updated_at: message.last_updated_at,
              isArchived: message.isArchived,
              isRead: message.isRead,
              isStarred: message.isStarred,
              // subject_embedding: message.subject_embedding,
              // body_embedding: message.body_embedding,
              // sender_embedding: message.sender_embedding,
              // receiver_embedding: message.receiver_embedding,
            };
          })
          .filter(Boolean);

        if (processedBatch.length > 0) {
          await this.prismaPrimary.primary.message.createMany({
            data: processedBatch,
            skipDuplicates: true,
          });
        }

        this.logger.log(
          `Inserted batch ${i / batchSize + 1} of ${Math.ceil(
            messages.length / batchSize,
          )}`,
        );
      }

      this.logger.log('Successfully completed message insertion');
      return {
        success: true,
        count: messages.length,
      };
    } catch (error) {
      this.logger.error('Error inserting messages:', error);
      throw error;
    }
  };
}
