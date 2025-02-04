import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma.service';
// import { ConfigService } from '@nestjs/config';
// import { Prisma } from 'prisma/generated/client-primary';
// import { IMessage } from './categorization.service';
// import { randomUUID } from 'crypto';
// import * as fs from 'fs/promises';
// import * as path from 'path';

// interface ICompanySearchResult {
//   id: string;
//   client: string | null;
//   email_domain: string | null;
//   website_domain: string | null;
//   match_score: number;
// }

// interface IDetailedCompanySearchResult {
//   company: ICompanySearchResult;
//   associatedContacts: {
//     email: string;
//     name?: string;
//     type: 'sender' | 'recipient' | 'cc' | 'bcc';
//     matched_domain: string;
//   }[];
// }

// interface IEmailContact {
//   email: string;
//   name?: string;
//   type: 'sender' | 'recipient' | 'cc' | 'bcc';
// }

@Injectable()
export class CompanyClassificationService {
  // private readonly logger = new Logger(CompanyClassificationService.name);
  // private readonly MATCH_THRESHOLD = 0.1;
  // private errorCount = 0;
  // private readonly logFilePath = path.join(
  //   process.cwd(),
  //   'logs',
  //   'company-classification-errors.log',
  // );
  // private readonly GENERIC_DOMAINS = [
  //   'gmail.com',
  //   'yahoo.com',
  //   'hotmail.com',
  //   'outlook.com',
  //   'aol.com',
  //   'icloud.com',
  //   'protonmail.com',
  //   'live.com',
  //   'msn.com',
  //   'me.com',
  //   'yandex.com',
  //   'linkedin.com',
  //   'facebook.com',
  //   'twitter.com',
  //   'instagram.com',
  //   'indeed.com',
  //   'monster.com',
  //   'glassdoor.com',
  //   'careerbuilder.com',
  //   'proficientnow.com',
  // ];
  // constructor(
  //   private prisma: PrismaService,
  //   private configService: ConfigService,
  // ) {
  //   this.initializeLogDirectory();
  // }
  // private async initializeLogDirectory() {
  //   try {
  //     await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });
  //   } catch (error) {
  //     this.logger.error(`Failed to create logs directory: ${error.message}`);
  //   }
  // }
  // private async logError(messageId: string, error: any, context: any) {
  //   this.errorCount++;
  //   const timestamp = new Date().toISOString();
  //   const logEntry = {
  //     timestamp,
  //     messageId,
  //     errorCount: this.errorCount,
  //     errorMessage: error.message,
  //     errorCode: error.code,
  //     errorType: error.name,
  //     context,
  //     // stackTrace: error.stack
  //   };
  //   try {
  //     const logMessage = `${JSON.stringify(logEntry, null, 2)}\n---\n`;
  //     await fs.appendFile(this.logFilePath, logMessage);
  //   } catch (err) {
  //     this.logger.error(`Failed to write to error log: ${err.message}`);
  //   }
  // }
  // // public async processEmail(
  // //   message: IMessage,
  // // ): Promise<IDetailedCompanySearchResult[]> {
  // //   this.logger.log(
  // //     `Processing email for company classification: ${message.id}`,
  // //   );
  // //   try {
  // //     const contacts = this.extractContacts(message);
  // //     const domains = this.extractBusinessDomains(message);
  // //     const companyMatches = await this.findCompanyMatches(domains);
  // //     const detailedResults = this.createDetailedResults(
  // //       companyMatches,
  // //       contacts,
  // //     );
  // //     if (detailedResults.length > 0) {
  // //       await this.createCompanyRelations(message.id, companyMatches, contacts);
  // //     }
  // //     return detailedResults;
  // //   } catch (error) {
  // //     await this.logError(message.id, error, {
  // //       messageSubject: message.subject,
  // //       senderEmail: message.sender_email,
  // //       extractedDomains: this.extractBusinessDomains(message),
  // //     });
  // //     throw error;
  // //   }
  // // }
  // private extractBusinessDomains(message: IMessage): string[] {
  //   const contacts = this.extractContacts(message);
  //   return contacts
  //     .map((contact) => this.extractDomain(contact.email))
  //     .filter((domain) => domain && !this.GENERIC_DOMAINS.includes(domain))
  //     .filter((domain, index, self) => self.indexOf(domain) === index); // Unique domains
  // }
  // // private async findCompanyMatches(
  // //   domains: string[],
  // // ): Promise<ICompanySearchResult[]> {
  // //   if (domains.length === 0) return [];
  // //   try {
  // //     const results = await this.prisma.readonly.organizations.findMany({
  // //       distinct: ['client'],
  // //       where: {
  // //         OR: [
  // //           {
  // //             website_domain: {
  // //               in: domains,
  // //               mode: 'insensitive',
  // //               not: 'proficientnow.com',
  // //             },
  // //           },
  // //           {
  // //             email_domain: {
  // //               in: domains,
  // //               mode: 'insensitive',
  // //               not: 'proficientnow.com',
  // //             },
  // //           },
  // //         ],
  // //       },
  // //       select: {
  // //         id: true,
  // //         client: true,
  // //         email_domain: true,
  // //         website_domain: true,
  // //         website: true,
  // //         research_analyst: true,
  // //         status: true,
  // //       },
  // //     });
  // //     return results.map((result) => ({
  // //       id: result.id,
  // //       client: result.client,
  // //       email_domain: result.email_domain,
  // //       website_domain: result.website_domain,
  // //       match_score: 1.0,
  // //     }));
  // //   } catch (error) {
  // //     this.logger.error(`Error in company search: ${error.message}`);
  // //     throw error;
  // //   }
  // // }
  // private createDetailedResults(
  //   companyMatches: ICompanySearchResult[],
  //   contacts: IEmailContact[],
  // ): IDetailedCompanySearchResult[] {
  //   return companyMatches.map((company) => ({
  //     company,
  //     associatedContacts: contacts
  //       .filter((contact) => {
  //         const contactDomain = this.extractDomain(contact.email);
  //         return (
  //           (company.email_domain &&
  //             contactDomain === company.email_domain.toLowerCase()) ||
  //           (company.website_domain &&
  //             contactDomain === company.website_domain.toLowerCase())
  //         );
  //       })
  //       .map((contact) => ({
  //         ...contact,
  //         matched_domain: this.extractDomain(contact.email),
  //       })),
  //   }));
  // }
  // private extractContacts(message: IMessage): IEmailContact[] {
  //   const contacts: IEmailContact[] = [];
  //   if (message.sender_email) {
  //     contacts.push({
  //       email: message.sender_email,
  //       name: message.sender_name,
  //       type: 'sender',
  //     });
  //   }
  //   const addContactsFromField = (field: any, type: IEmailContact['type']) => {
  //     const emails = this.parseJsonEmails(field);
  //     emails?.forEach((email) => {
  //       contacts.push({ email, type });
  //     });
  //   };
  //   addContactsFromField(message.recipients, 'recipient');
  //   addContactsFromField(message.cc_recipients, 'cc');
  //   addContactsFromField(message.bcc_recipients, 'bcc');
  //   return contacts;
  // }
  // private parseJsonEmails(jsonField: any): string[] | null {
  //   if (!jsonField) return null;
  //   const extractEmail = (item: any): string | null => {
  //     if (typeof item === 'string') return item;
  //     if (typeof item !== 'object' || !item) return null;
  //     return item.emailAddress?.address || item.email || null;
  //   };
  //   if (!Array.isArray(jsonField)) {
  //     const email = extractEmail(jsonField);
  //     return email ? [email] : null;
  //   }
  //   return jsonField
  //     .map(extractEmail)
  //     .filter((email): email is string => email !== null);
  // }
  // private extractDomain(email: string): string {
  //   return email.split('@')[1]?.toLowerCase() || '';
  // }
  // private async createCompanyRelations(
  //   messageId: string,
  //   matches: ICompanySearchResult[],
  //   contacts: IEmailContact[],
  // ): Promise<void> {
  //   try {
  //     await this.prisma.primary.$transaction(async (tx) => {
  //       await this.createDefaultCompanyStatus(tx);
  //       const companies = await this.createOrUpdateCompanies(tx, matches);
  //       await this.createMessageCompanyRelations(
  //         tx,
  //         messageId,
  //         companies,
  //         matches,
  //         contacts,
  //       );
  //     });
  //   } catch (error) {
  //     this.logger.error(`Error creating company relations: ${error.message}`);
  //     throw error;
  //   }
  // }
  // private async createDefaultCompanyStatus(tx: any) {
  //   return tx.companyStatus.upsert({
  //     where: { value: 'ACTIVE' },
  //     create: {
  //       id: randomUUID(),
  //       value: 'ACTIVE',
  //       key: 'active',
  //       field_display_name: 'company_status',
  //       color_hex: '00FF00',
  //       created_by: 'system',
  //     },
  //     update: {},
  //   });
  // }
  // // private async createOrUpdateCompanies(
  // //   tx: any,
  // //   matches: ICompanySearchResult[],
  // // ) {
  // //   return Promise.all(
  // //     matches.map(async (match) => {
  // //       const readonlyCompany = await this.fetchReadonlyCompany(match.id);
  // //       return tx.company.upsert({
  // //         where: {
  // //           domain: match.website_domain || match.email_domain,
  // //         },
  // //         create: {
  // //           name: readonlyCompany?.client || match.client || 'Unknown Company',
  // //           website:
  // //             readonlyCompany?.website ||
  // //             `https://${match.website_domain || match.email_domain}`,
  // //           domain: match.website_domain || match.email_domain,
  // //           status: 'ACTIVE',
  // //           is_deleted: false,
  // //           created_by: 'system',
  // //           organization_id: readonlyCompany?.id || match.id,
  // //           raw_body: readonlyCompany
  // //             ? (readonlyCompany as unknown as Prisma.JsonValue)
  // //             : null,
  // //         },
  // //         update: {},
  // //       });
  // //     }),
  // //   );
  // // }
  // // private async fetchReadonlyCompany(id: string) {
  // //   return this.prisma.readonly.organizations.findFirst({
  // //     where: { id },
  // //     select: {
  // //       id: true,
  // //       client: true,
  // //       website: true,
  // //       email_domain: true,
  // //       website_domain: true,
  // //       research_analyst: true,
  // //       poc_email: true,
  // //       poc_name: true,
  // //       created: true,
  // //       created_by: true,
  // //     },
  // //   });
  // // }
  // private async createMessageCompanyRelations(
  //   tx: any,
  //   messageId: string,
  //   companies: any[],
  //   matches: ICompanySearchResult[],
  //   contacts: IEmailContact[],
  // ) {
  //   // try{
  //   await Promise.all(
  //     companies.map(async (company, index) => {
  //       // First check if relation exists
  //       const existingRelation = await tx.messageCompanyRelation.findFirst({
  //         where: {
  //           message_id: messageId,
  //           company_id: company.id,
  //         },
  //       });
  //       const relationData = {
  //         message_id: messageId,
  //         company_id: company.id,
  //         relevance_score: matches[index].match_score,
  //         match_reasons: {
  //           matched_contacts: contacts
  //             .filter(
  //               (c) => !this.GENERIC_DOMAINS.some((d) => c.email.includes(d)),
  //             )
  //             .map((c) => c.email),
  //           source_organization_id: matches[index].id,
  //         },
  //       };
  //       if (existingRelation) {
  //         // Update existing relation
  //         await tx.messageCompanyRelation.update({
  //           where: { id: existingRelation.id },
  //           data: {
  //             relevance_score: relationData.relevance_score,
  //             match_reasons: relationData.match_reasons,
  //           },
  //         });
  //       } else {
  //         // Create new relation
  //         await tx.messageCompanyRelation.create({
  //           data: relationData,
  //         });
  //       }
  //     }),
  //   );
  // }
}
