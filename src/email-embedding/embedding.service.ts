import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import * as cheerio from 'cheerio';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaServicePrimary } from './prisma.service';
import { IEmailParticipants, Department, IMessage } from 'src/types';
// import { Prisma } from '@pnats/db-prisma/dist/prisma/sql/tenants/client';
import {
  bdms,
  finance,
  recruiters,
  researchers,
} from '../email-categorization/users';
// import { Prisma } from 'prisma/generated/client-primary';

@Injectable()
export class EmbeddingAndCategorizationService {
  private readonly logger = new Logger(EmbeddingAndCategorizationService.name);
  private readonly recruitmentEmails: Set<string>;
  private readonly researchEmails: Set<string>;
  private readonly financeEmails: Set<string>;
  private readonly openaiEmbeddings: OpenAIEmbeddings;
  private readonly schema: string;
  private readonly tenantId: string;
  private prisma: PrismaServicePrimary;

  constructor(
    @InjectQueue('email-processing') private readonly emailQueue: Queue,
    private readonly prismaService: PrismaServicePrimary,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    // TODO: schema/tenant id to be uploaded dynamically
    this.schema = 'embeddings';
    this.tenantId = this.schema;

    this.openaiEmbeddings = new OpenAIEmbeddings({
      apiKey,
      modelName: 'text-embedding-3-small',
      dimensions: 1024,
    });

    this.recruitmentEmails = new Set([...bdms, ...recruiters]);
    this.researchEmails = new Set(researchers);
    this.financeEmails = new Set(finance);

    // const dbConfig: IDatabaseConfig = {
    //   atsMain: this.configService.get<string>('ATS_MAIN_DATABASE_URL') ?? '',
    //   tenantSql: this.configService.get<string>('TENANT_DATABASE_URL') ?? '',
    //   atsNoSql: this.configService.get<string>('ATS_POLICY_DATABASE_URL') ?? '',
    //   tenantNoSql:
    //     this.configService.get<string>('TENANT_POLICY_DATABASE_URL') ?? '',
    //   commsMail: this.configService.get<string>('COMMS_DATABASE_URL') ?? '',
    //   nodeEnv: this.configService.get<string>('NODE_ENV') ?? '',
    //   tenantDbHost: this.configService.get<string>('TENANT_DB_HOST'),
    //   tenantDb: this.configService.get<string>('TENANT_POSTGRES_DB'),
    //   tenantDbUser: this.configService.get<string>('TENANT_POSTGRES_USER'),
    //   tenantDbPass: this.configService.get<string>('TENANT_POSTGRES_PASSWORD'),
    // };

    // this.prismaService = new PrismaService(dbConfig);
  }

  /**
   * Adds a new message to the email processing queue
   * @param {IMessage} message - Message representing an email
   * @returns Returns an acknowledgment stating the message id
   */
  public async queueSingleEmail(message: IMessage): Promise<string> {
    try {
      await this.emailQueue.add('process-email', message, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        priority: 1,
      });

      return `Queued new email ${message.id} for processing`;
    } catch (error) {
      this.logger.error(`Error queuing single message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Processes each email, generates vector embeddings of the required fields and categorizes the email by department
   * @param {IMessage} message - Represents an email
   * @returns Returns success or failure acknowledgement
   */
  public processMessage = async (message: IMessage): Promise<string> => {
    try {
      this.logger.log(`Starting to process message ${message.id}`);
      const emailData = {
        sender_email: message.sender_email,
        recipients: this.parseJsonEmails(message.recipients),
        cc_recipients: this.parseJsonEmails(message.cc_recipients),
        bcc_recipients: this.parseJsonEmails(message.bcc_recipients),
      };
      this.logger.log(`Parsed email data: ${JSON.stringify(emailData)}`);

      const departments = this.determineCategories(emailData);
      this.logger.log(`Determined departments: ${departments}`);

      const existingMetaData = this.parseMetadata(message.meta_data);
      this.logger.log(`Parsed metadata: ${JSON.stringify(existingMetaData)}`);

      await this.updateMessageMetadata(message.id, {
        ...existingMetaData,
        departments,
      });
      this.logger.log(`Updated message metadata`);

      this.logger.log(`Starting embedding generation`);
      await this.generateAndStoreEmbeddings(message);
      this.logger.log(`Completed embedding generation`);

      return departments.length > 0
        ? `successfully categorized as ${departments.join(' and ')}`
        : 'categorization unsuccessful - no matching department found';
    } catch (error) {
      this.logger.error(`Error in processMessage: ${error.stack}`);
      throw error;
    }
  };
  /**
   * Parses metadata from string or object format
   * @param metaData - Message metadata in string or object format
   * @returns Parsed metadata as an object
   */
  private parseMetadata(metaData: any): Record<string, any> {
    if (!metaData) return {};

    try {
      if (!metaData) {
        return {};
      }

      if (typeof metaData === 'string') {
        return JSON.parse(metaData);
      }

      if (
        typeof metaData === 'object' &&
        !Array.isArray(metaData) &&
        metaData !== null
      ) {
        return metaData as Record<string, unknown>;
      }

      return {};
    } catch (error) {
      this.logger.warn(`Error parsing message metadata: ${error.message}`);
      return {};
    }
  }

  /**
   * Updates message metadata in the database
   * @param messageId - ID of the message to update
   * @param metaData - New metadata to store
   */
  private async updateMessageMetadata(
    messageId: string,
    metaData: any,
  ): Promise<void> {
    // const tenantClient = await this.prismaService.getClient(this.tenantId);

    try {
      await this.prismaService.primary.message.update({
        where: { id: messageId },
        data: { meta_data: metaData },
      });
    } catch (error) {
      this.logger.error(`Error updating message metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parses JSON data to extract email addresses, handling both single recipient objects
   * and arrays of recipients with nested structures
   * @param jsonField - JSON data containing email information
   * @returns Array of email addresses if present
   */
  private parseJsonEmails(jsonField: any): string[] | null {
    if (!jsonField) return null;

    if (
      typeof jsonField === 'object' &&
      !Array.isArray(jsonField) &&
      jsonField.emailAddress?.address
    ) {
      return [jsonField.emailAddress.address];
    }

    if (!Array.isArray(jsonField)) return null;

    return jsonField
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return item.emailAddress?.address || item.email;
        }
        return typeof item === 'string' ? item : null;
      })
      .filter((email): email is string => email !== null);
  }

  /**
   * Converts HTML content to plain text by removing script and style tags,
   * replacing certain tags with newlines, and normalizing whitespace
   * @param html - HTML content to convert
   * @returns Cleaned plain text content
   */
  private htmlToText(html: string): string {
    if (!html) return '';

    const $ = cheerio.load(html);
    $('script, style').remove();
    $('div, p, br').after('\n');
    $('li').before('- ');

    return $.text().replace(/\s+/g, ' ').trim();
  }

  /**
   * Determines the department category based on email participants
   * @param emailData - Email participants data
   * @returns Array of matched departments
   */
  private determineCategories(emailData: IEmailParticipants): Department[] {
    const allParticipants = this.getAllParticipants(emailData);
    const matchedDepartments = new Set<Department>();

    if (this.hasMatchingParticipants(allParticipants, this.recruitmentEmails)) {
      matchedDepartments.add(Department.RECRUITMENT);
    }

    if (this.hasMatchingParticipants(allParticipants, this.researchEmails)) {
      matchedDepartments.add(Department.RESEARCH);
    }

    if (this.hasMatchingParticipants(allParticipants, this.financeEmails)) {
      matchedDepartments.add(Department.FINANCE);
    }

    if (matchedDepartments.size === 0) {
      matchedDepartments.add(Department.OTHER);
    }

    return Array.from(matchedDepartments);
  }

  /**
   * Extracts all participants from email data
   * @param emailData - Email participants data
   * @returns Set of all email addresses
   */
  private getAllParticipants(emailData: IEmailParticipants): Set<string> {
    const participants = new Set<string>();
    participants.add(emailData.sender_email.toLowerCase());

    this.addEmailsToSet(participants, emailData.recipients);
    this.addEmailsToSet(participants, emailData.cc_recipients);
    this.addEmailsToSet(participants, emailData.bcc_recipients);

    return participants;
  }

  /**
   * Adds email addresses to a Set
   * @param set - Target Set to add emails to
   * @param emails - Array of email addresses
   */
  private addEmailsToSet(
    set: Set<string>,
    emails: string[] | null | undefined,
  ): void {
    if (emails?.length) {
      emails.forEach((email) => set.add(email.toLowerCase()));
    }
  }

  /**
   * Checks if any participant matches the category emails
   * @param participants - Set of participants
   * @param categoryEmails - Set of category emails
   * @returns True if there's a match, false otherwise
   */
  private hasMatchingParticipants(
    participants: Set<string>,
    categoryEmails: Set<string>,
  ): boolean {
    return Array.from(participants).some((participant) =>
      categoryEmails.has(participant.toLowerCase()),
    );
  }

  /**
   * Generates and stores embeddings for message content
   * @param message - Message to generate embeddings for
   */
  private async generateAndStoreEmbeddings(message: IMessage): Promise<void> {
    const maxLength = 7000;
    // await this.prismaService.primary.getClient(this.tenantId);
    const plainTextBody = this.htmlToText(message.body);

    try {
      const [
        subjectEmbedding,
        bodyEmbedding,
        senderEmbedding,
        receiverEmbedding,
      ] = await Promise.all([
        this.openaiEmbeddings.embedQuery(
          (message.subject || '').slice(0, maxLength),
        ),
        this.openaiEmbeddings.embedQuery(plainTextBody.slice(0, maxLength)),
        this.openaiEmbeddings.embedQuery(
          JSON.stringify({
            email: message.sender_email,
            name: message.sender_name,
          }).slice(0, maxLength),
        ),
        this.openaiEmbeddings.embedQuery(
          JSON.stringify(message.recipients || '').slice(0, maxLength),
        ),
      ]);

      // const schemaName = Prisma.raw(`"${this.schema}"`);
      await this.prismaService.primary.$executeRaw`
      UPDATE "embeddings"."messages"
      SET 
        subject_embedding = ${JSON.stringify(subjectEmbedding)}::"embeddings".vector,
        body_embedding = ${JSON.stringify(bodyEmbedding)}::"embeddings".vector,
        sender_embedding = ${JSON.stringify(senderEmbedding)}::"embeddings".vector,
        receiver_embedding = ${JSON.stringify(receiverEmbedding)}::"embeddings".vector
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
