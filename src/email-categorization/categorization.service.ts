/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { bdms, finance, recruiters, researchers } from './users';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as cheerio from 'cheerio';
import { Prisma } from 'client';
enum Department {
  RESEARCH = 'RESEARCH',
  RECRUITMENT = 'RECRUITMENT',
  FINANCE = 'FINANCE',
  OTHER = 'OTHER',
}
interface IEmailParticipants {
  sender_email: string;
  recipients?: string[] | null;
  cc_recipients?: string[] | null;
  bcc_recipients?: string[] | null;
}

const schema = '019403ee-2961-7f8e-9682-c2c5dede384b';

export interface IMessage {
  [x: string]: any;
  id: string;
  ms_message_id?: string;
  subject?: string;
  sender_name?: string;
  sender_email: string;
  received_date_time?: Date;
  // sent_date_time?: Date;
  body: string;
  // body_preview?: string;
  recipients?: Prisma.JsonValue;
  cc_recipients?: Prisma.JsonValue;
  bcc_recipients?: Prisma.JsonValue;
  // reply_to?: Prisma.JsonValue ;
  // has_attachments: boolean;
  summary?: Prisma.JsonValue;
  meta_data?: Prisma.JsonValue;
  source_id?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  created_at?: Date;
  last_updated_at?: Date;
}

// interface ICategoryData {
//   message_id: string;
//   department: Department;
//   sender_embedding?: any[];
//   receiver_embedding?: any[];
//   subject_embedding?: any[];
//   body_embedding?: any[];
// }
@Injectable()
export class CategorizationService {
  private readonly recruitmentEmails: Set<string>;
  private readonly researchEmails: Set<string>;
  private readonly financeEmails: Set<string>;
  private openaiEmbeddings: OpenAIEmbeddings;
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    @InjectQueue('email-processing') private emailQueue: Queue,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Initialize Sets for faster lookups
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openaiEmbeddings = new OpenAIEmbeddings({
      apiKey: apiKey,
    });
    this.recruitmentEmails = new Set([...bdms, ...recruiters]);
    this.researchEmails = new Set(researchers);
    this.financeEmails = new Set(finance);
  }

  public async categorizeBatchMessages(
    batchSize: number = 100,
  ): Promise<string> {
    this.logger.log('Starting batch categorization of all messages');

    try {
      let totalMessages = 0;
      let skip = 0;

      while (true) {
        // Fetch batch of messages
        const messages = await this.prisma.primary.message.findMany({
          take: batchSize,
          skip: skip,
          // orderBy: {
          //     created_at: 'asc'
          // },
          select: {
            id: true,
            ms_message_id: true,
            subject: true,
            sender_name: true,
            sender_email: true,
            body: true,
            recipients: true,
            cc_recipients: true,
            bcc_recipients: true,
            meta_data: true,
          },
        });

        // Break if no more messages
        if (messages.length === 0) {
          break;
        }

        // Queue the batch
        await this.queueBatchEmails(messages);

        totalMessages += messages.length;
        this.logger.log(`Queued ${totalMessages} messages for processing`);
        skip += batchSize;
      }

      return `Successfully queued ${totalMessages} messages for processing`;
    } catch (error) {
      this.logger.error(`Error in batch categorization: ${error.message}`);
      throw error;
    }
  }

  /**
   * adds a new message to the email processing queue with
   * @param {IMessage} message - `message` parameter of type `IMessage` represents an email
   * @returns returns an acknowledgment stating that the message id.
   */
  public async queueSingleEmail(message: IMessage) {
    try {
      const job = await this.emailQueue.add('process-email', message, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        priority: 1, // Higher priority for real-time processing
      });

      return `Queued new email ${message.id} for processing`;
    } catch (error) {
      this.logger.error(`Error queuing single message: ${error.message}`);
      throw error;
    }
  }

  private async queueBatchEmails(messages: IMessage[]) {
    try {
      const jobs = await Promise.all(
        messages.map((message) =>
          this.emailQueue.add('process-email', message, {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          }),
        ),
      );

      return `Queued ${jobs.length} messages for processing`;
    } catch (error) {
      this.logger.error(`Error queuing batch messages: ${error.message}`);
      throw error;
    }
  }

  public processMessage = async (message: IMessage) => {
    // this.logger.log(message)
    try {
      const emailData = {
        sender_email: message.sender_email,
        recipients: this.parseJsonEmails(message.recipients),
        cc_recipients: this.parseJsonEmails(message.cc_recipients),
        bcc_recipients: this.parseJsonEmails(message.bcc_recipients),
      };

      this.logger.log(`Processing message from: ${emailData.sender_email}`);

      const departments = this.determineCategories(emailData);
      this.logger.log(
        `Determined departments: ${departments.join(', ') || 'none'}`,
      );

      const embeddings = await this.generateAndStoreEmbeddings(message);
      this.logger.log('Generated embeddings successfully');

      // Prepare categorization metadata
      const categorizationData = {
        departments,
        // embeddings: {
        //     sender: embeddings?.sender,
        //     receiver: embeddings?.receiver,
        //     subject: embeddings?.subject,
        //     body: embeddings?.body
        // }
      };

      // Merge existing metadata with new categorization data
      const existingMetaData =
        message.meta_data &&
        typeof message.meta_data === 'object' &&
        !Array.isArray(message.meta_data)
          ? (message.meta_data as Record<string, unknown>)
          : {};

      const updatedMetaData = {
        ...existingMetaData,
        departments: [...departments],
      };

      await this.updateMessageMetadata(message.id, updatedMetaData);

      if (departments.length > 0) {
        return `successfully categorized as ${departments.join(' and ')}`;
      } else {
        this.logger.warn(
          `Categorization failed for email: ${message.sender_email}`,
        );
        return 'categorization unsuccessful - no matching department found';
      }
    } catch (error) {
      this.logger.error(`Error in processMessage: ${error.message}`);
      throw error;
    }
  };

  private async updateMessageMetadata(messageId: string, metaData: any) {
    try {
      return await this.prisma.primary.message.update({
        where: { id: messageId },
        data: { meta_data: metaData },
      });
    } catch (error) {
      this.logger.error(`Error updating message metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse JSON email field to string array
   * @param jsonField JSON field that might contain emails
   * @returns Array of email addresses or null
   */
  private parseJsonEmails(jsonField: any): string[] | null {
    if (!jsonField) {
      return null;
    }

    // Handle single recipient object with nested emailAddress structure
    if (
      typeof jsonField === 'object' &&
      !Array.isArray(jsonField) &&
      jsonField.emailAddress?.address
    ) {
      return [jsonField.emailAddress.address];
    }

    // Handle array of recipients with nested emailAddress structure
    if (Array.isArray(jsonField)) {
      return jsonField
        .map((item) => {
          if (typeof item === 'object' && item !== null) {
            // Handle nested emailAddress structure
            if (item.emailAddress?.address) {
              return item.emailAddress.address;
            }
            // Fallback for direct email property
            if (item.email) {
              return item.email;
            }
          }
          if (typeof item === 'string') {
            return item;
          }
          return null;
        })
        .filter((email): email is string => email !== null);
    }

    return null;
  }
  private htmlToText(html: string): string {
    if (!html) return '';
    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script, style').remove();

    // Replace some common tags with newlines
    $('div, p, br').after('\n');
    $('li').before('- ');

    // Get text content and clean it up
    let text = $.text();

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Determines the department category based on email participants
   * @param emailData Email participants data
   * @returns Department or null if uncategorized
   */
  private determineCategories(emailData: IEmailParticipants): Department[] {
    const allParticipants = this.getAllParticipants(emailData);
    const matchedDepartments = new Set<Department>();

    // Check for recruitment department matches
    if (this.hasMatchingParticipants(allParticipants, this.recruitmentEmails)) {
      matchedDepartments.add(Department.RECRUITMENT);
    }

    // Check for research department matches
    if (this.hasMatchingParticipants(allParticipants, this.researchEmails)) {
      matchedDepartments.add(Department.RESEARCH);
    }

    // Check for finance department matches
    if (this.hasMatchingParticipants(allParticipants, this.financeEmails)) {
      matchedDepartments.add(Department.FINANCE);
    }

    // If no departments matched, add OTHER
    if (matchedDepartments.size === 0) {
      matchedDepartments.add(Department.OTHER);
    }

    return Array.from(matchedDepartments);
  }

  /**
   * Extracts all participants from email data
   * @param emailData Email participants data
   * @returns Set of all email addresses
   */
  private getAllParticipants(emailData: IEmailParticipants): Set<string> {
    const participants = new Set<string>();

    // Add sender
    participants.add(emailData.sender_email.toLowerCase());

    // Add recipients
    this.addEmailsToSet(participants, emailData.recipients);
    this.addEmailsToSet(participants, emailData.cc_recipients);
    this.addEmailsToSet(participants, emailData.bcc_recipients);
    this.logger.log('participants', participants);
    return participants;
  }

  /**
   * Adds email addresses to a Set
   * @param set Target Set
   * @param emails Array of email addresses or null
   */
  private addEmailsToSet(
    set: Set<string>,
    emails: string[] | null | undefined,
  ): void {
    if (emails && Array.isArray(emails)) {
      emails.forEach((email) => set.add(email.toLowerCase()));
    }
  }

  /**
   * Checks if any participant matches the category emails
   * @param participants Set of participants
   * @param categoryEmails Set of category emails
   * @returns boolean
   */
  private hasMatchingParticipants(
    participants: Set<string>,
    categoryEmails: Set<string>,
  ): boolean {
    for (const participant of participants) {
      if (categoryEmails.has(participant.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Stores the categorization in the primary database
   * @param categoryData Category data to store
   * @returns Created categorization record
   */
  // private async storeCategorization(categoryData: ICategoryData) {
  //     try {
  //       return await this.prisma.primary.emailCategorization.create({
  //         data: categoryData
  //       });
  //     } catch (error) {
  //       // Handle potential duplicate message_id error
  //       if (error.code === 'P2002') {
  //         // Update existing categorization if message_id already exists
  //         return await this.prisma.primary.emailCategorization.update({
  //           where: { message_id: categoryData.message_id },
  //           data: categoryData
  //         });
  //       }
  //       throw error;
  //     }
  //   }

  // private async createEmbeddings(emailData: IMessage): Promise<any> {
  //     try {
  //         // Convert HTML body to plain text
  //         const plainTextBody = this.htmlToText(emailData.body);

  //         const [subjectEmbed, bodyEmbed, senderEmailEmbed, senderNameEmbed, receiverEmbed] =
  //             await Promise.all([
  //                 this.openaiEmbeddings.embedQuery(emailData.subject || ''),
  //                 this.openaiEmbeddings.embedQuery(plainTextBody),
  //                 this.openaiEmbeddings.embedQuery(emailData.sender_email),
  //                 this.openaiEmbeddings.embedQuery(emailData.sender_name || ''),
  //                 this.openaiEmbeddings.embedQuery(JSON.stringify(emailData.recipients || '')),
  //             ]);

  //         return {
  //             subject: subjectEmbed,
  //             body: bodyEmbed,
  //             sender: {
  //                 senderEmailEmbed,
  //                 senderNameEmbed
  //             },
  //             receiver: receiverEmbed,
  //         };
  //     } catch (error) {
  //         this.logger.error(`Error generating embeddings: ${error.message}`);
  //         throw error;
  //     }
  // }

  private async generateAndStoreEmbeddings(message: IMessage): Promise<void> {
    try {
      const plainTextBody = this.htmlToText(message.body);

      // Truncate text to approximate token limits
      // A rough estimate is 4 chars per token, so we'll limit to ~7000 chars to stay safe
      const maxLength = 7000;
      const truncatedBody = plainTextBody.slice(0, maxLength);
      const truncatedSubject = (message.subject || '').slice(0, maxLength);
      const truncatedSenderInfo = JSON.stringify({
        email: message.sender_email,
        name: message.sender_name,
      }).slice(0, maxLength);
      const truncatedRecipients = JSON.stringify(
        message.recipients || '',
      ).slice(0, maxLength);

      const [
        subjectEmbedding,
        bodyEmbedding,
        senderEmbedding,
        receiverEmbedding,
      ] = await Promise.all([
        this.openaiEmbeddings.embedQuery(truncatedSubject),
        this.openaiEmbeddings.embedQuery(truncatedBody),
        this.openaiEmbeddings.embedQuery(truncatedSenderInfo),
        this.openaiEmbeddings.embedQuery(truncatedRecipients),
      ]);

      const schemaName = Prisma.raw(`"${schema}"`);

      await this.prisma.primary.$executeRaw`
                UPDATE ${schemaName}.messages 
                SET 
                    subject_embedding = ${JSON.stringify(subjectEmbedding)}::${schemaName}.vector,
                    body_embedding = ${JSON.stringify(bodyEmbedding)}::${schemaName}.vector,
                    sender_embedding = ${JSON.stringify(senderEmbedding)}::${schemaName}.vector,
                    receiver_embedding = ${JSON.stringify(receiverEmbedding)}::${schemaName}.vector
                WHERE id = ${message.id}::uuid
            `;
    } catch (error) {
      this.logger.error(
        `Error generating or storing embeddings: ${error.message}`,
      );
      throw error;
    }
  }
}
