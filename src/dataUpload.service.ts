// import { Injectable, Logger } from '@nestjs/common';
// // import { Email, Prisma } from '@prisma/client';
// // import { PrismaService } from 'prisma/prisma.service';
// import { ConfigService } from '@nestjs/config';
// import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
// import parseValidatedClassifications, {
//   ClassificationResponse,
//   RawEmailData,
//   SimilarEmail,
// } from './types';
// import * as fs from 'fs/promises';
// import { RunnableSequence } from '@langchain/core/runnables';
// import { StructuredOutputParser } from '@langchain/core/output_parsers';
// import { ChatPromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
// import { z } from 'zod';
// import {
//   Annotation,
//   END,
//   START,
//   StateGraph,
//   MessagesAnnotation,
// } from '@langchain/langgraph';
// import { ToolNode } from '@langchain/langgraph/prebuilt';
// // import { ALL_TOOLS, prompt, VALIDATOR_PROMPT } from './tools';
// import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

// const classificationSchema = z.object({
//   classifications: z.array(
//     z.object({
//       category: z.string(),
//       instances: z.array(
//         z.object({
//           name: z.string(),
//           confidence: z.number(),
//           metadata: z.record(z.any()),
//           similarityScore: z.number().optional(),
//         }),
//       ),
//     }),
//   ),
// });

// @Injectable()
// export class EmailService {
//   private readonly logger = new Logger(EmailService.name);
//   private openaiEmbeddings: OpenAIEmbeddings;
//   private chatOpenAi: ChatOpenAI;
//   private validationModel:ChatOpenAI;
//   private classificationChain: RunnableSequence;
//   private validationGraph;
//   private GraphAnnotation;

//   constructor(
//     // private prisma: PrismaService,
//     private configService: ConfigService,
//   ) {
//     const apiKey = this.configService.get<string>('OPENAI_API_KEY');
//     this.openaiEmbeddings = new OpenAIEmbeddings({
//       apiKey: apiKey,
//     });
//     this.chatOpenAi = new ChatOpenAI({
//       modelName: 'gpt-4-turbo-preview',
//       apiKey: apiKey,
//       streaming: false,
//     });
//     this.validationModel = new ChatOpenAI({
//       modelName: 'gpt-3.5-turbo',
//       apiKey: apiKey,
//       streaming: false,
//     });
//     this.GraphAnnotation = Annotation.Root({
//       ...MessagesAnnotation.spec,
//       classification: Annotation<z.infer<typeof classificationSchema>>(),
//       validatedClassifications: Annotation<ClassificationResponse>(),
//       // context: Annotation<string>(),
//     });
//     this.initializeClassificationChain();
//     this.setUpValidationGraph();
//   }
//   // private setupValidationGraph() {
//   //   this.validationGraph = new StateGraph(this.GraphAnnotation)

//   // }
//   private async initializeClassificationChain() {
//     const outputParser =
//       StructuredOutputParser.fromZodSchema(classificationSchema);

//     const promptTemplate = ChatPromptTemplate.fromTemplate(`
//      ${prompt}

//       For each instance you identify, you must include meaningful metadata:
//       - For Clients: Include industry, location if mentioned
//       - For Contacts: Include role/title, company affiliation if mentioned
//       - For Candidates: Include skills, experience level if mentioned
//       - For Positions: Include required skills, location if mentioned
//       - For Location: Include city, state, zip code if available
//       - For Point of Contacts: Include role, department if mentioned

//       Email to classify:
//       {emailContent}

//       Ensure each instance includes relevant metadata extracted from the email content.

//       {format_instructions}
//     `);

//     this.classificationChain = RunnableSequence.from([
//       {
//         emailContent: (input: {
//           emailContent: string;
//           similarEmailsContext: any;
//         }) => input.emailContent,
//         similarEmailsContext: (input: {
//           emailContent: string;
//           similarEmailsContext: any;
//         }) => JSON.stringify(input.similarEmailsContext, null, 2),
//         categories: () => `
//           - Clients
//           - Contacts
//           - Candidates
//           - Positions
//           - Location
//           - Point of Contacts
//         `,
//         format_instructions: () => outputParser.getFormatInstructions(),
//       },
//       promptTemplate,
//       this.chatOpenAi,
//       outputParser,
//     ]);
//   }
//   private async setUpValidationGraph() {
//     const toolNode = new ToolNode(ALL_TOOLS);
//     const model = this.validationModel.bindTools(ALL_TOOLS);

//     // const agentPromptTemplate=SystemMessagePromptTemplate.fromTemplate(`
//     //   ${VALIDATOR_PROMPT}`)

//     const callModel = async (state: typeof this.GraphAnnotation.State) => {
//       const messages = state.messages;
//       const context = state.context;

//       // Combine system message, context, and user messages
//       const allMessages = [
//        VALIDATOR_PROMPT,
//         // new SystemMessage(context), // Add stored context
//         ...messages
//       ];

//       const response = await model.invoke(allMessages);

//       if (response.tool_calls?.length) {
//         return {
//           messages: [response],
//           // context: state.context, // Preserve context
//         };
//       }

//       const toolMessages = messages.filter((msg) => msg.type === 'tool');
//       const validatedClassifications = {
//         classifications: toolMessages.map((msg) => {
//           const toolResponse = JSON.parse(msg.content);
//           return toolResponse.classifications[0];
//         }),
//       };

//       return {
//         messages: [response],
//         validatedClassifications,
//         // context: state.context, // Preserve context
//       };
//     };

//     const shouldContinue = (state: typeof this.GraphAnnotation.State) => {
//       const lastMessage = state.messages[
//         state.messages.length - 1
//       ] as AIMessage;
//       return lastMessage.tool_calls?.length ? 'tools' : END;
//     };

//     this.validationGraph = new StateGraph(this.GraphAnnotation)
//       .addNode('agent', callModel.bind(this))
//       .addNode('tools', toolNode)
//       .addEdge(START, 'agent')
//       .addConditionalEdges('agent', shouldContinue)
//       .addEdge('tools', 'agent')
//       .compile();
//   }

//   async uploadAllEmails(jsonData: any) {
//     this.logger.log('Starting batch email upload');
//     try {
//       const uploadedEmails = [];
//       for (const [emailAddress, emails] of Object.entries(jsonData)) {
//         this.logger.log(`Processing emails for: ${emailAddress}`);
//         for (const email of emails as RawEmailData[]) {
//           const uploadedEmail = await this.uploadEmailDataBatch(email);
//           uploadedEmails.push(uploadedEmail);
//         }
//       }
//       return uploadedEmails;
//     } catch (error) {
//       this.logger.error('Error in batch upload:', error);
//       throw error;
//     }
//   }

//   private async generateEmbeddings(emailData: RawEmailData): Promise<any> {
//     try {
//       const [subjectEmbed, bodyEmbed, senderEmbed, receiverEmbed] =
//         await Promise.all([
//           this.openaiEmbeddings.embedQuery(emailData.subject || ''),
//           this.openaiEmbeddings.embedQuery(emailData.body || ''),
//           this.openaiEmbeddings.embedQuery(JSON.stringify(emailData.sender)),
//           this.openaiEmbeddings.embedQuery(JSON.stringify(emailData.receiver)),
//         ]);

//       return {
//         subject: subjectEmbed,
//         body: bodyEmbed,
//         sender: senderEmbed,
//         receiver: receiverEmbed,
//       };
//     } catch (error) {
//       this.logger.error(`Error generating embeddings: ${error.message}`);
//       throw error;
//     }
//   }

//   async uploadEmailDataBatch(emailData: RawEmailData) {
//     this.logger.log(`Processing email with subject: ${emailData.subject}`);
//     try {
//       // First transaction: Create email with embeddings
//       // const email = await this.prisma.primary.$transaction(async (prisma) => {
//       //   const embeddings = await this.generateEmbeddings(emailData);

//       //   const createdEmail = await prisma.email.create({
//       //     data: {
//       //       subject: emailData.subject,
//       //       body: emailData.body,
//       //       sentDateTime: new Date(emailData.sent_datetime),
//       //       receivedDateTime: new Date(emailData.received_datetime),
//       //       hasAttachments: emailData.has_attachments || false,
//       //       sender: emailData.sender as unknown as Prisma.JsonValue,
//       //       receiver: emailData.receiver as unknown as Prisma.JsonValue,
//       //     },
//       //   });

//       //   // Update embeddings
//       //   await prisma.$executeRaw`
//       //     UPDATE "Email"
//       //     SET
//       //       "subjectEmbedding" = ${JSON.stringify(embeddings.subject)}::vector,
//       //       "bodyEmbedding" = ${JSON.stringify(embeddings.body)}::vector,
//       //       "senderEmbedding" = ${JSON.stringify(embeddings.sender)}::vector,
//       //       "receiverEmbedding" = ${JSON.stringify(embeddings.receiver)}::vector
//       //     WHERE id = ${createdEmail.id}
//       //   `;

//       //   return createdEmail;
//       // });

//       // // Ensure email exists before classification
//       // await new Promise((resolve) => setTimeout(resolve, 1000));

//       // // Then classify
//       // await this.classifyEmail(email);

//       // return email;
//     } catch (error) {
//       this.logger.error(`Error uploading email: ${error.message}`);
//       throw error;
//     }
//   }

//   // async findSimilarEmails(queryText: string, limit: number = 2) {
//   //   try {
//   //     // Parse the query text to extract components
//   //     const subject = queryText.match(/Subject: (.+?)(?=\n|$)/)?.[1] || '';
//   //     const body = queryText.match(/Body: (.+?)(?=\n|$)/)?.[1] || '';
//   //     const sender = queryText.match(/From: (.+?)(?=\n|$)/)?.[1] || '{}';
//   //     const receiver = queryText.match(/To: (.+?)(?=\n|$)/)?.[1] || '{}';

//   //     // Generate embeddings for each component
//   //     const embeddings = await this.generateEmbeddings({
//   //       subject,
//   //       body,
//   //       sender: JSON.parse(sender),
//   //       receiver: JSON.parse(receiver),
//   //       sent_datetime: new Date().toISOString(),
//   //       received_datetime: new Date().toISOString(),
//   //       has_attachments: false,
//   //     });

//   //     const similarityThreshold = 0.1;

//   //     const hybridSearchQuery = Prisma.sql`
//   //       WITH similarity_scores AS (
//   //         SELECT
//   //           id,
//   //           (
//   //             COALESCE(("subjectEmbedding" <=> ${JSON.stringify(embeddings.subject)}::vector) * 0.3, 0) +
//   //             COALESCE(("bodyEmbedding" <=> ${JSON.stringify(embeddings.body)}::vector) * 0.4, 0) +
//   //             COALESCE(("senderEmbedding" <=> ${JSON.stringify(embeddings.sender)}::vector) * 0.15, 0) +
//   //             COALESCE(("receiverEmbedding" <=> ${JSON.stringify(embeddings.receiver)}::vector) * 0.15, 0)
//   //           ) as semantic_score,
//   //           (
//   //             ts_rank_cd(to_tsvector('english', body), plainto_tsquery('english', ${body})) * 0.4 +
//   //             ts_rank_cd(to_tsvector('english', subject), plainto_tsquery('english', ${subject})) * 0.3 +
//   //             ts_rank_cd(to_tsvector('english', sender::text), plainto_tsquery('english', ${sender})) * 0.15 +
//   //             ts_rank_cd(to_tsvector('english', receiver::text), plainto_tsquery('english', ${receiver})) * 0.15
//   //           ) as keyword_score
//   //         FROM "Email"
//   //         WHERE "subjectEmbedding" IS NOT NULL
//   //           AND "bodyEmbedding" IS NOT NULL
//   //           AND "senderEmbedding" IS NOT NULL
//   //           AND "receiverEmbedding" IS NOT NULL
//   //       )
//   //       SELECT
//   //         e.id,
//   //         e.subject,
//   //         e.body,
//   //         e."sentDateTime",
//   //         e."receivedDateTime",
//   //         e."hasAttachments",
//   //         e.sender::text as sender,
//   //         e.receiver::text as receiver,
//   //         s.semantic_score,
//   //         s.keyword_score,
//   //         (s.semantic_score * 0.7 + s.keyword_score * 0.3) as combined_score
//   //       FROM "Email" e
//   //       JOIN similarity_scores s ON e.id = s.id
//   //       WHERE (s.semantic_score < ${similarityThreshold} OR s.keyword_score > 0.1)
//   //       ORDER BY combined_score ASC
//   //       LIMIT ${limit}
//   //     `;

//   //     this.logger.log(
//   //       'Running hybrid search with threshold:',
//   //       similarityThreshold,
//   //     );

//   //     const similarEmails =
//   //       // await this.prisma.$queryRaw<SimilarEmail[]>(hybridSearchQuery);
//   //     this.logger.log(similarEmails);

//   //     if (similarEmails.length > 0) {
//   //       this.logger.log(
//   //         'Found similar emails with scores:',
//   //         similarEmails.map((email) => ({
//   //           id: email.id,
//   //           subject: email.subject,
//   //           semantic_score: email.similarity,
//   //         })),
//   //       );
//   //     }

//   //     return similarEmails;
//   //   } catch (error) {
//   //     this.logger.error(`Error finding similar emails: ${error.message}`);
//   //     // Return empty array instead of throwing
//   //     return [];
//   //   }
//   // }
//   // private async classifyEmail(email: Email) {
//   //   this.logger.log('Starting enhanced classification');
//   //   try {
//   //     const emailContent = `
//   //       Subject: ${email.subject}
//   //       Body: ${email.body}
//   //       From: ${JSON.stringify(email.sender)}
//   //       To: ${JSON.stringify(email.receiver)}
//   //     `;

//   //     const similarEmails = await this.findSimilarEmails(emailContent, 5);

//   //     const existingClassifications = await this.prisma.emailEntity.findMany({
//   //       where: {
//   //         emailId: {
//   //           in: similarEmails.map((email) => email.id),
//   //         },
//   //       },
//   //       include: {
//   //         entity: true,
//   //         entityInstance: true,
//   //       },
//   //     });

//   //     const similarEmailsContext = existingClassifications.reduce(
//   //       (acc, classification) => {
//   //         const category = classification.entity.name;
//   //         if (!acc[category]) {
//   //           acc[category] = [];
//   //         }
//   //         acc[category].push({
//   //           name: classification.entityInstance.name,
//   //           confidence: classification.confidence,
//   //           metadata: classification.entityInstance.metadata,
//   //         });
//   //         return acc;
//   //       },
//   //       {} as Record<string, any[]>,
//   //     );

//   //     const result = await this.classificationChain.invoke({
//   //       emailContent,
//   //       similarEmailsContext,
//   //     });

//   //     this.logger.log(result);

//   //     const validationResult = await this.validationGraph.invoke({
//   //       messages: [new HumanMessage(`Validate: ${JSON.stringify(result)}`)],
//   //       classification: result, // Add the original classification to state
//   //     });

//   //     // Use the validatedClassifications directly
//   //     await this.storeClassifications(
//   //       email.id,
//   //       validationResult.validatedClassifications,
//   //       similarEmails,
//   //     );
//   //   } catch (error) {
//   //     this.logger.error(`Error in enhanced classification: ${error.message}`);
//   //     throw error;
//   //   }
//   // }
// //   private async storeClassifications(
// //     emailId: string,
// //     classifications: ClassificationResponse,
// //     similarEmails: SimilarEmail[],
// // ) {
// //     try {
// //         await this.prisma.$transaction(async (prisma) => {
// //             for (const classification of classifications.classifications) {
// //                 if (!classification.instances?.length) continue;

// //                 const entity = await prisma.entity.upsert({
// //                     where: { name: classification.category },
// //                     create: { name: classification.category },
// //                     update: {},
// //                 });

// //                 for (const instance of classification.instances) {
// //                     if (instance.confidence < 0.95) continue;

// //                     const finalConfidence = instance.confidence * 0.7 +
// //                         (instance.similarityScore || 0) * 0.3;

// //                     console.log("this is the final confidence",finalConfidence)

// //                     const entityInstance = await prisma.entityInstance.upsert({
// //                         where: {
// //                             entityId_name: {
// //                                 entityId: entity.id,
// //                                 name: instance.name,
// //                             },
// //                         },
// //                         create: {
// //                             entityId: entity.id,
// //                             name: instance.name,
// //                             metadata: {
// //                                 ...instance.metadata,
// //                                 similarityContext: instance.similarityScore
// //                                     ? {
// //                                         score: instance.similarityScore,
// //                                         similarEmails: similarEmails.length,
// //                                     }
// //                                     : null,
// //                             },
// //                         },
// //                         update: {
// //                             // metadata: {
// //                             //     ...instance.metadata,
// //                             //     similarityContext: instance.similarityScore
// //                             //         ? {
// //                             //             score: instance.similarityScore,
// //                             //             similarEmails: similarEmails.length,
// //                             //         }
// //                             //         : null,
// //                             // },
// //                         },
// //                     });

// //                     console.log(entityInstance)

// //                     const existingEmailEntity = await prisma.emailEntity.findUnique({
// //                       where: {
// //                           emailId_entityId_entityInstanceId: {
// //                               emailId,
// //                               entityId: entity.id,
// //                               entityInstanceId: entityInstance.id,
// //                           },
// //                       },
// //                   });

// //                   this.logger.log('Checking for existing EmailEntity:', {
// //                       emailId,
// //                       entityId: entity.id,
// //                       entityInstanceId: entityInstance.id,
// //                       exists: !!existingEmailEntity
// //                   });

// //                   if (existingEmailEntity) {
// //                       this.logger.log('EmailEntity already exists:', {
// //                           id: existingEmailEntity.id,
// //                           emailId: existingEmailEntity.emailId,
// //                           entityId: existingEmailEntity.entityId,
// //                           entityInstanceId: existingEmailEntity.entityInstanceId
// //                       });
// //                       continue;
// //                   }

// //                   try {
// //                       this.logger.log('Attempting to create EmailEntity with data:', {
// //                           emailId,
// //                           entityId: entity.id,
// //                           entityInstanceId: entityInstance.id,
// //                           confidence: finalConfidence
// //                       });

// //                       const emailEntity = await prisma.emailEntity.create({
// //                           data: {
// //                               emailId,
// //                               entityId: entity.id,
// //                               entityInstanceId: entityInstance.id,
// //                               confidence: finalConfidence,
// //                           },
// //                       });

// //                       this.logger.log('Successfully created EmailEntity:', {
// //                           id: emailEntity.id,
// //                           emailId: emailEntity.emailId,
// //                           entityId: emailEntity.entityId,
// //                           entityInstanceId: emailEntity.entityInstanceId,
// //                           confidence: emailEntity.confidence
// //                       });
// //                   } catch (error) {
// //                       this.logger.error('Error during EmailEntity creation:', {
// //                           error: {
// //                               code: error.code,
// //                               message: error.message,
// //                               name: error.name
// //                           },
// //                           data: {
// //                               emailId,
// //                               entityId: entity.id,
// //                               entityInstanceId: entityInstance.id,
// //                           }
// //                       });

// //                       if (error.code === 'P2002') {
// //                           this.logger.warn('Duplicate EmailEntity detected:', {
// //                               emailId,
// //                               entityId: entity.id,
// //                               entityInstanceId: entityInstance.id,
// //                           });
// //                       } else {
// //                           throw error;
// //                       }
// //                   }
// //                 }
// //             }
// //         });
// //     } catch (error) {
// //         this.logger.error('Error in storeClassifications:', error);
// //         throw error;
// //     }
// // }

//   async uploadEmailsFromFile(filePath: string) {
//     this.logger.log(`Reading emails from file: ${filePath}`);
//     try {
//       const fileContent = await fs.readFile(filePath, 'utf8');
//       const jsonData = JSON.parse(fileContent);
//       return await this.uploadAllEmails(jsonData);
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new Error(`File not found: ${filePath}`);
//       }
//       if (error instanceof SyntaxError) {
//         throw new Error('Invalid JSON file format');
//       }
//       this.logger.error('Error processing file:', error);
//       throw error;
//     }
//   }
// }
