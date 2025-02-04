/* eslint-disable @typescript-eslint/no-unused-vars */
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationTopic, Prisma } from 'prisma';
import { PrismaService } from 'src/prisma.service';
import { IMessage } from './categorization.service';
import * as cheerio from 'cheerio';
import { bdms, finance, generic, recruiters, researchers } from './users';
import OpenAI from 'openai';
import { businessLogic } from 'src/tools';

const schema = '019403ee-2961-7f8e-9682-c2c5dede384b';
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
const SIMILARITY_THRESHOLD = 0.75;
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private openaiEmbeddings: OpenAIEmbeddings;
  private readonly recruitmentEmails: Set<string>;
  private readonly researchEmails: Set<string>;
  private readonly financeEmails: Set<string>;
  private chatOpenAi: OpenAI;
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openaiEmbeddings = new OpenAIEmbeddings({
      apiKey: apiKey,
    });
    this.chatOpenAi = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    this.recruitmentEmails = new Set([...bdms, ...recruiters]);
    this.researchEmails = new Set(researchers);
    this.financeEmails = new Set(finance);
  }

  //     // const email = await this.prisma.primary.message.findUnique({
  //     //     where: { id: emailId },
  //     //     select: {
  //     //       id: true,
  //     //       body: true,
  //     //       subject: true,
  //     //       sender_email: true,
  //     //       meta_data: true,
  //     //     //   body_embedding: true,
  //     //     //   subject_embedding: true,
  //     //     //   sender_embedding: true,
  //     //       MessageCompanyRelation: true
  //     //     }

  //     // });

  //     // let body_embedding=await this.prisma.primary.$queryRaw
  //     // `SELECT body_embedding
  //     // FROM "messages"
  //     // WHERE id=${emailId}
  //     // `
  //     // let sender_embedding=await this.prisma.primary.$queryRaw
  //     // `SELECT body_embedding
  //     // FROM "messages"
  //     // WHERE id=${emailId}
  //     // `
  //     let status_embedding=await this.prisma.primary.$queryRaw
  //     `  SELECT "subject_embedding"::"019403ee-2961-7f8e-9682-c2c5dede384b".vector
  //   FROM "019403ee-2961-7f8e-9682-c2c5dede384b"."messages"
  //   WHERE id = ${emailId}::uuid
  //     `
  //     // let receiver_embedding=await this.prisma.primary.$queryRaw
  //     // `SELECT body_embedding
  //     // FROM "messages"
  //     // WHERE id=${emailId}
  //     // `

  //     // if (!email) throw new Error('Email not found');

  //     // const updates: Prisma.MessageUpdateInput = {};
  //     // // Generate embeddings if missing
  //     // if (!body_embedding) {
  //     //   updates.body_embedding = await this.generateEmbedding(email.body);
  //     // }

  //     // // Extract metadata and company info
  //     // const department = this.getDepartment(email.meta_data);
  //     // const companyId = email.MessageCompanyRelation?.[0]?.company_id;

  //     // // Detect conversation topic with department context
  //     // const topic = await this.detectTopic(email, department);

  //     // // Find or create conversation
  //     // const conversation = await this.findOrCreateConversation({
  //     //   email,
  //     //   department,
  //     //   companyId,
  //     //   topic,
  //     // });

  //     // return conversation;

  //     this.logger.log("subject embedding",status_embedding);

  //   };

  processEmail = async (message: IMessage) => {
    const emailId = message.id;
    try {
      // Check and generate embeddings
      const hasEmbedding = await this.checkEmbeddingsExist(emailId);
      if (!hasEmbedding) await this.generateAndStoreEmbeddings(message);

      // Get conversation parameters
      const emailData = this.parseEmailData(message);
      this.logger.log('email data', emailData);
      const department = this.getDepartment(message.meta_data, emailData);
      this.logger.log(department);
      const companyRelation = await this.getCompanyRelation(emailId);
      this.logger.log('company relation', companyRelation);
      const topic = await this.detectTopic(message, department);

      // Find or create conversation
      return this.findOrCreateConversation({
        message,
        department,
        companyId: companyRelation?.company_id,
        topic,
      });
    } catch (error) {
      this.logger.error(`Error processing email ${emailId}:`, error);
      throw error;
    }
  };

  private async checkEmbeddingsExist(emailId: string): Promise<boolean> {
    const result = await this.prisma.primary.$queryRaw<
      { has_embedding: boolean }[]
    >`
      SELECT "subject_embedding" IS NOT NULL AS "has_embedding"
      FROM "${Prisma.raw(schema)}"."messages"
      WHERE id = ${emailId}::uuid
    `;
    return result[0]?.has_embedding ?? false;
  }

  private async getCompanyRelation(emailId: string) {
    return this.prisma.primary.messageCompanyRelation.findFirst({
      where: { message_id: emailId },
    });
  }

  private parseEmailData(message: IMessage): IEmailParticipants {
    return {
      sender_email: message.sender_email,
      recipients: this.parseJsonEmails(message.recipients),
      cc_recipients: this.parseJsonEmails(message.cc_recipients),
      bcc_recipients: this.parseJsonEmails(message.bcc_recipients),
    };
  }

  private async findOrCreateConversation(params: {
    message: IMessage;
    department: string;
    companyId?: string;
    topic: string; // Changed from ConversationTopic to string
  }) {
    const { message, topic } = params;
    const domain = this.extractDomain(message.sender_email);

    // Find existing conversations - removed enum casting
    const existing = await this.prisma.primary.$queryRaw<{ id: string }[]>`
      SELECT id 
      FROM "${Prisma.raw(schema)}"."conversations"
      WHERE 
        "conversation_topic" = ${topic}
        AND "domain" = ${domain}
      ORDER BY "last_updated_at" DESC
      LIMIT 1
    `;

    if (existing.length > 0) {
      return this.addToConversation(existing[0].id, message.id);
    }

    return this.createNewConversation(message, domain, topic);
  }

  private async addToConversation(conversationId: string, messageId: string) {
    return this.prisma.primary.$executeRaw`
      UPDATE "${Prisma.raw(schema)}"."conversations"
      SET 
        "threads" = "threads" || ${JSON.stringify([messageId])}::jsonb,
        "last_updated_at" = NOW()
      WHERE id = ${conversationId}::uuid
    `;
  }

  private async createNewConversation(
    message: IMessage,
    domain: string,
    topic: string, // Changed from ConversationTopic to string
  ) {
    return this.prisma.primary.conversation.create({
      data: {
        domain,
        conversation_topic: topic,
        threads: [message.id],
        created_at: new Date(),
        last_updated_at: new Date(),
      },
    });
  }

  //   private async detectTopic(email: any, department: string): Promise<ConversationTopic> {
  //     // Department-based priority
  //     const departmentTopics = {
  //       'RESEARCH': ['INITIAL_CONTACT', 'POSITION_DESCRIPTION'],
  //       'RECRUITMENT': ['CANDIDATE_SUBMISSION', 'CANDIDATE_REVIEW', 'INTERVIEW'],
  //       'FINANCE': ['CONTRACT', 'EMPLOYMENT'],
  //       'OTHER': []
  //     };

  //     // First check subject/keywords
  //     const subject = email.subject.toLowerCase();
  //     if (subject.includes('contract')) return 'CONTRACT';
  //     if (subject.includes('interview')) return 'INTERVIEW';
  //     if (subject.includes('resume')) return 'CANDIDATE_SUBMISSION';
  //     if (subject.includes('position')) return 'POSITION_DESCRIPTION';

  //     // Fallback to department-based default
  //     return departmentTopics[department]?.[0] || 'INITIAL_CONTACT';
  //   }
  private async detectTopic(
    message: IMessage,
    department: string,
  ): Promise<ConversationTopic> {
    try {
      // Initial keyword-based checks for quick classification
      const subject = (message.subject || '').toLowerCase();
      const body = this.htmlToText(message.body).toLowerCase();

      if (
        subject.includes('interview') ||
        body.includes('interview schedule')
      ) {
        return 'INTERVIEW';
      }
      if (subject.includes('contract') || body.includes('offer letter')) {
        return 'CONTRACT';
      }
      if (
        subject.includes('resume') ||
        subject.includes('cv') ||
        body.includes('candidate profile')
      ) {
        return 'CANDIDATE_SUBMISSION';
      }
      if (subject.includes('position') || subject.includes('job description')) {
        return 'POSITION_DESCRIPTION';
      }

      // Get company name for context
      const companyRelation = await this.getCompanyRelation(message.id);
      const companyInfo = companyRelation
        ? await this.prisma.primary.company.findUnique({
            where: { id: companyRelation.company_id },
            select: { name: true },
          })
        : null;

      // Build prompt with minimal context
      const prompt = `Task: Email Topic Identification
      Bussiness Information:${businessLogic}
      Context Information:
      Department: ${department}
      ${companyInfo?.name ? `Company: ${companyInfo.name}` : ''}
      
      Email Content:
      Subject: ${message.subject}
      Body:
      ${this.htmlToText(message.body).substring(0, 3000)}
      
      Instructions:
      - Analyze the email content thoroughly
      - Determine the main topic or purpose of the email
      - Be specific and concise in your topic naming
      - Use a short phrase (1-2 words) that best describes the email's core purpose, if not related to bussiness logic, then give a very generic phrase to it.
      
      Response Format:
      - Return ONLY the topic
      - Use clear, business-appropriate terminology
      - Capitalize each word in the topic
      - No explanations or additional text`;
      try {
        const response = await this.chatOpenAi.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          //   max_tokens: 50
        });

        const predictedTopic =
          response.choices[0].message.content?.trim() as ConversationTopic;

        // Validate the predicted topic
        // if (Object.values(ConversationTopic).includes(predictedTopic)) {
        return predictedTopic;
        // }

        // this.logger.warn(`LLM returned invalid topic: ${predictedTopic}. Using fallback.`);
        // return this.getFallbackTopic(department);
      } catch (error) {
        this.logger.error('LLM topic detection failed:', error);
        // return this.getFallbackTopic(department);
      }
    } catch (error) {
      this.logger.error(`Error in topic detection: ${error.message}`);
      //   return this.getFallbackTopic(department);
    }
  }

  private extractDomain(email: string): string {
    return email.split('@').pop()?.split('.')[0] || 'unknown';
  }

  private getFallbackTopic(department: string): ConversationTopic {
    const fallbacks = {
      RESEARCH: 'INITIAL_CONTACT',
      RECRUITMENT: 'CANDIDATE_SUBMISSION',
      FINANCE: 'CONTRACT',
      OTHER: 'INITIAL_CONTACT',
    };
    return fallbacks[department] || 'INITIAL_CONTACT';
  }

  //   private getFallbackTopic(department: string): ConversationTopic {
  //     const fallbacks = {
  //       RESEARCH: 'INITIAL_CONTACT',
  //       RECRUITMENT: 'CANDIDATE_SUBMISSION',
  //       FINANCE: 'CONTRACT',
  //       OTHER: 'INITIAL_CONTACT'
  //     };
  //     return fallbacks[department] || 'INITIAL_CONTACT';
  //   }
  //   private async llmFallbackTopicDetection(message: IMessage, department: string): Promise<ConversationTopic> {
  //     const prompt = `
  //       Analyze this email and classify it into ONE of these topics:
  //       ${Object.values(ConversationTopic).join(', ')}

  //       Department Context: ${department}
  //       If Department is OTHER then thoroughly analyze the email and give an appropriate topic, which need not be from the topics list I provided.

  //       Email Subject: ${message.subject}
  //       Email Body: ${this.htmlToText(message.body).substring(0, 3000)}

  //       Respond ONLY with the topic name. No explanations.
  //     `;

  //     try {
  //       const response = await this.chatOpenAi.chat.completions.create({
  //         model: "gpt-4-turbo",
  //         messages: [{ role: "user", content: prompt }],
  //         temperature: 0.1,
  //       });

  //       return response.choices[0].message.content as ConversationTopic;
  //     } catch (error) {
  //       this.logger.error('LLM topic detection failed:', error);
  //       return this.getFallbackTopic(department);
  //     }
  //   }

  //   private getFallbackTopic(department: string): ConversationTopic {
  //     const fallbacks = {
  //       RESEARCH: 'INITIAL_CONTACT',
  //       RECRUITMENT: 'CANDIDATE_SUBMISSION',
  //       FINANCE: 'CONTRACT',
  //       OTHER: 'INITIAL_CONTACT'
  //     };
  //     return fallbacks[department] || 'INITIAL_CONTACT';
  //   }

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

  private getDepartment(metaData: any, emailData: IEmailParticipants): string {
    // Get initial department from metadata
    let department = metaData?.categorization?.departments?.[0];

    // Check for generic emails in all participants, regardless of metadata department
    const allEmails = new Set<string>();

    // Add sender
    allEmails.add(emailData.sender_email.toLowerCase());

    // Add all recipients
    if (emailData.recipients) {
      emailData.recipients.forEach((email) =>
        allEmails.add(email.toLowerCase()),
      );
    }
    if (emailData.cc_recipients) {
      emailData.cc_recipients.forEach((email) =>
        allEmails.add(email.toLowerCase()),
      );
    }
    if (emailData.bcc_recipients) {
      emailData.bcc_recipients.forEach((email) =>
        allEmails.add(email.toLowerCase()),
      );
    }

    // Check if any participant is a generic email
    const hasGenericEmail = Array.from(allEmails).some((email) =>
      generic.includes(email.toLowerCase()),
    );

    if (hasGenericEmail) {
      this.logger.log(
        'Generic email found in participants, setting department to OTHER',
      );
      return Department.OTHER;
    }

    // If no generic emails and no department from metadata, determine from participants
    if (!department) {
      const departments = this.determineCategories(emailData);
      this.logger.log('Determined departments:', departments);
      department = departments[0];
    }

    // Make sure we always return a department
    if (!department) {
      department = Department.OTHER;
    }

    this.logger.log('Final department:', department);
    return department;
  }
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

  private addEmailsToSet(
    set: Set<string>,
    emails: string[] | null | undefined,
  ): void {
    if (emails && Array.isArray(emails)) {
      emails.forEach((email) => set.add(email.toLowerCase()));
    }
  }
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
}
