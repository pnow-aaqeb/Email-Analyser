import { Injectable } from '@nestjs/common';
import { Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
// import { AIMessage, BaseMessage } from '@langchain/core/messages'

type EmailContent = {
  body: string;
  subject: string;
  sender: string;
};

type AttachmentMetadata = {
  file_type: string;
  file_name: string;
};

type Attachment = {
  content: string;
  metadata: AttachmentMetadata;
};

type Classification = {
  type: 'Resume' | 'Contract' | 'Job Description' | 'Invoice' | 'Other';
  confidence: number;
  reasoning: string;
};

type ProcessedResume = {
  name: string;
  skills: string[];
  experience: string[];
};

type ProcessedInvoice = {
  vendor: string;
  amount: number;
  due_date: string;
};

type ProcessedContract = {
  parties: string[];
  expiration: string;
};

type ResultMetadata = {
  processing_time: number;
  steps_executed: string[];
};

// Define the root annotation structure
const GraphAnnotation = Annotation.Root({
  input: Annotation<{
    email_content: EmailContent;
    attachments: Attachment[];
  }>(),

  classification: Annotation<Classification>(),

  processed_data: Annotation<
    | { type: 'resume'; data: ProcessedResume }
    | { type: 'invoice'; data: ProcessedInvoice }
    | { type: 'contract'; data: ProcessedContract }
  >(),

  errors: Annotation<string[]>(),
  warnings: Annotation<string[]>(),

  result: Annotation<{
    attachment_type: string;
    processed_data: any; // This will be type-safe through the union above
    metadata: ResultMetadata;
  }>(),
});

@Injectable()
export class OrchestrationAgent {
  private readonly openai: ChatOpenAI;
  private readonly graph: any;
  constructor() {
    this.graph = GraphAnnotation;
  }
}
