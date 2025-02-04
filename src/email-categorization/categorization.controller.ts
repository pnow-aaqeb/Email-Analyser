/* eslint-disable @typescript-eslint/no-unused-vars */
import { Controller, Delete, Get, Logger, Post } from '@nestjs/common';
import { CategorizationService } from './categorization.service';
import { PrismaService } from 'src/prisma.service';
import { CompanyClassificationService } from './classificatoin.service';
import { ConversationService } from './conversation.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

interface IEmailRequest {
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

@Controller()
export class CategorizationController {
  private readonly logger = new Logger(CategorizationController.name);
  private readonly BATCH_SIZE = 100;

  constructor(
    private categorizationService: CategorizationService,
    private prisma: PrismaService,
    private classificationService: CompanyClassificationService,
    private conversationService: ConversationService,
    @InjectQueue('email-processing') private emailQueue: Queue,
  ) {}

  @Get('health')
  getHealth(): string {
    return 'service healthy.';
  }

  @Post('categorize')
  async categorizeAllMessages(): Promise<string> {
    return await this.categorizationService.categorizeBatchMessages();
  }

  // @Post('classify')
  // async companyClassify(@Body() email: IEmailRequest){
  //     try {
  //         this.logger.log(`Processing single email classification for: ${email.id}`);
  //         const result = await this.classificationService.processEmail(email);

  //         return {
  //             success: true,
  //             message: `Email classified successfully`,
  //             matches: result.map(match => ({
  //                 companyName: match.client,
  //                 score: match.match_score
  //             }))
  //         };
  //     } catch (error) {
  //         this.logger.error(`Error classifying email: ${error.message}`);
  //         return {
  //             success: false,
  //             message: `Classification failed: ${error.message}`,
  //             matches: []
  //         };
  //     }
  // }

  // @Post('classify-all')
  // async classifyAllMessages() {
  //   try {
  //     let processedCount = 0;
  //     let successCount = 0;
  //     let failureCount = 0;
  //     let skip = 0;

  //     while (true) {
  //       const messages = await this.prisma.primary.message.findMany({
  //         where: {
  //           MessageCompanyRelation: {
  //             none: {},
  //           },
  //         },
  //         take: this.BATCH_SIZE,
  //         skip: skip,
  //         // orderBy: {
  //         //     created_at: 'a'
  //         // },
  //         select: {
  //           id: true,
  //           ms_message_id: true,
  //           subject: true,
  //           sender_name: true,
  //           sender_email: true,
  //           body: true,
  //           recipients: true,
  //           cc_recipients: true,
  //           bcc_recipients: true,
  //           meta_data: true,
  //         },
  //       });

  //       if (messages.length === 0) {
  //         break;
  //       }

  //       for (const message of messages) {
  //         try {
  //           const result =
  //             await this.classificationService.processEmail(message);
  //           if (result && result.length > 0) {
  //             this.logger.log('result is', result);
  //             successCount++;
  //           } else {
  //             failureCount++;
  //           }
  //         } catch (error) {
  //           failureCount++;
  //         }
  //         processedCount++;
  //       }
  //       skip += this.BATCH_SIZE;
  //     }

  //     return {
  //       success: true,
  //       message: 'Classification complete',
  //       stats: {
  //         total: processedCount,
  //         successful: successCount,
  //         failed: failureCount,
  //       },
  //     };
  //   } catch (error) {
  //     return {
  //       success: false,
  //       message: `Classification failed: ${error.message}`,
  //       stats: {
  //         total: 0,
  //         successful: 0,
  //         failed: 0,
  //       },
  //     };
  //   }
  // }

  @Get('fetch-vector')
  async fetchVectors() {
    // try{

    //     const result =await this.conversationService.processEmail('9965cd1e-0f03-4fa6-b86b-8c542116e78e')
    //     this.logger.log(result)
    // }catch(error){
    //     this.logger.log(error)
    // }
    this.logger.log('Starting batch categorization of all messages');

    try {
      let processedCount = 0;
      const successCount = 0;
      let failureCount = 0;
      let skip = 0;

      while (true) {
        // Fetch batch of messages with only necessary fields
        const messages = await this.prisma.primary.message.findMany({
          take: this.BATCH_SIZE,
          skip: skip,
          orderBy: {
            created_at: 'asc',
          },
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

        // Process batch
        for (const message of messages) {
          try {
            const result = await this.conversationService.processEmail(message);
            // if (result.includes('successfully')) {
            //     successCount++;
            // } else {
            //     failureCount++;
            // }
            this.logger.log('result is ', result);
          } catch (error) {
            this.logger.error(
              `Error processing message ${message.id}: ${error.message}`,
            );
            failureCount++;
          }
          processedCount++;
        }

        this.logger.log(`Processed ${processedCount} messages so far`);
        skip += this.BATCH_SIZE;
      }

      return `Categorization complete. Total processed: ${processedCount}, Successfully processed: ${successCount}, Failed: ${failureCount}`;
    } catch (error) {
      this.logger.error(`Error in batch categorization: ${error.message}`);
      throw error;
    }
  }

  @Delete('queue/clear')
  async clearQueue() {
    await this.emailQueue.empty();
    return 'Queue cleared successfully';
  }
}
