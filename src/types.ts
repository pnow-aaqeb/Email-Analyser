/* eslint-disable @typescript-eslint/no-unused-vars */
// src/email/dto/email.dto.ts
// import { Prisma } from '@prisma/client';
import { Prisma } from 'prisma/generated/client-primary';
import { z } from 'zod';

export interface EmailAttachment {
  name: string;
  content_type: string;
}

export interface EmailParticipant {
  name: string;
  email: string;
}
export interface ClassificationInstance {
  name: string;
  confidence: number;
  metadata: Record<string, any>;
  similarityScore?: number;
}

export interface Classification {
  category: string;
  instances: ClassificationInstance[];
}

export interface ClassificationResponse {
  classifications: Classification[];
}

export interface RawEmailData {
  subject: string;
  sender: EmailParticipant;
  receiver: EmailParticipant;
  body: string;
  sent_datetime: string;
  received_datetime: string;
  has_attachments: boolean;
  attachments?: EmailAttachment[];
}

export interface EmailDataStructure {
  [email: string]: RawEmailData[];
}

export class CreateEmailDto {
  subject: string;
  body: string;
  sentDateTime: Date;
  receivedDateTime: Date;
  hasAttachments: boolean;
  sender: Prisma.JsonValue;
  receiver: Prisma.JsonValue;
}
// export type EmailWithEmbedding = Prisma.EmailCreateInput & {
//   embedding?: number[];
// };

export interface SimilarEmail {
  id: string;
  subject: string;
  body: string;
  sentDateTime: Date;
  receivedDateTime: Date;
  hasAttachments: boolean;
  sender: string;
  receiver: string;
  embedding: string;
  similarity: number;
  entities: string[];
  entity_confidence: number;
}
export interface UploadPathDto {
  filePath: string;
}
interface Instance {
  name: string;
  confidence: number;
  metadata?: Record<string, any>;
}

function parseValidatedClassifications(
  messageContent: string,
): ClassificationResponse {
  try {
    // Split the content by bullet points to separate categories
    const categories = messageContent.split(/\n-\s+/);

    const classifications: Classification[] = [];

    // Process each category section
    for (const category of categories) {
      if (!category.trim()) continue;

      // Extract category name
      const categoryMatch = category.match(/\*\*(.*?)\*\*:/);
      if (!categoryMatch) continue;

      const categoryName = categoryMatch[1];
      const instances: ClassificationInstance[] = [];

      // Extract instances using regex
      const instanceMatches = category.matchAll(
        /(\w+(?:\s+\w+)*?):\s+Validated with a confidence of ([\d.]+)/g,
      );

      for (const match of instanceMatches) {
        instances.push({
          name: match[1].trim(),
          confidence: parseFloat(match[2]),
          metadata: {},
        });
      }

      if (instances.length > 0) {
        classifications.push({
          category: categoryName,
          instances,
        });
      }
    }

    return { classifications };
  } catch (error) {
    console.error('Error parsing validated classifications:', error);
    return { classifications: [] };
  }
}

export default parseValidatedClassifications;

// Add other existing types...

// export type EmailCreateInputWithVector = Prisma.EmailCreateInput & {
//   embedding?: vector;
// };

import { JsonArray, JsonObject } from '@prisma/client/runtime/library';
export declare type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

export interface IMessage {
  // [x: string]: any;
  id: string;
  ms_message_id?: string;
  subject?: string;
  sender_name?: string;
  sender_email: string;
  received_date_time?: Date;
  // sent_date_time?: Date;
  body: string;
  // body_preview?: string;
  recipients?: JsonValue;
  cc_recipients?: JsonValue;
  bcc_recipients?: JsonValue;
  // reply_to?: Prisma.JsonValue ;
  // has_attachments: boolean;
  summary?: JsonValue;
  meta_data?: JsonValue;
  source_id?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  created_at?: Date;
  last_updated_at?: Date;
}

export enum Department {
  RESEARCH = 'RESEARCH',
  RECRUITMENT = 'RECRUITMENT',
  FINANCE = 'FINANCE',
  OTHER = 'OTHER',
}
export interface IEmailParticipants {
  sender_email: string;
  recipients?: string[] | null;
  cc_recipients?: string[] | null;
  bcc_recipients?: string[] | null;
}
export interface IEmailRequest {
  id: string;
  ms_message_id?: string;
  subject?: string;
  sender_name?: string;
  sender_email: string;
  body: string;
  recipients?: any;
  cc_recipients?: any;
  bcc_recipients?: any;
  meta_data?: any;
}
export type EmailContent = {
  body: string
  subject: string
  sender: string
  recipients: string[]
}

export type AttachmentMetadata = {
  file_type: string
  file_name: string
}

export type Attachment = {
  content: string
  metadata: AttachmentMetadata
}

export type Classification = {
  type: 'Resume' | 'Contract' | 'Job Description' | 'Invoice' | 'Other'
  confidence: number
  reasoning: string
}

export type ProcessedResume = {
  name: string
  skills: string[]
  experience: string[]
}

export type ProcessedInvoice = {
  vendor: string
  amount: number
  due_date: string
}

export type ProcessedContract = {
  parties: string[]
  expiration: string
}

export type ResultMetadata = {
  processing_time: number
  steps_executed: string[]
}
