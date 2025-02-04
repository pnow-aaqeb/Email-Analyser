import {
  Body,
  Controller,
  Logger,
  Post,
  HttpException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EmbeddingAndCategorizationService } from './embedding.service';
import { IMessage } from 'src/types';
import { EmbeddingMessageSwagger } from './embedding.swagger';
import { InsertMessages } from './message.service';

@ApiTags('Email Categorization')
@Controller({ version: '1' })
export class EmbeddingController {
  private readonly logger = new Logger(EmbeddingController.name);

  constructor(
    private readonly embeddingService: EmbeddingAndCategorizationService,
    private readonly insertMessages: InsertMessages,
    @InjectQueue('email-processing') private readonly emailQueue: Queue,
  ) {}

  @Post('embedding')
  @EmbeddingMessageSwagger()
  @HttpCode(HttpStatus.CREATED)
  async categorizeMessage(@Body() message: IMessage) {
    this.logger.log(
      `Received categorization request for message: ${message.id}`,
    );

    try {
      const result = await this.embeddingService.queueSingleEmail(message);

      return {
        status: 'success',
        message: result,
      };
    } catch (error) {
      this.logger.error(`Error in categorizeMessage: ${error.message}`);
      throw new HttpException(
        error.message,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('insert')
  async insertMessage() {
    await Promise.resolve()
      .then(async () => {
        const result = await this.insertMessages.insertEmails();
        this.logger.log('inserting messages', result);
      })
      .catch((error) => {
        this.logger.error('Error inserting messages:', error);
        throw error;
      });
  }
}
