/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common'
import { Annotation, Command, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import {
  Attachment,
  EmailContent,
  ProcessedContract,
  ProcessedInvoice,
  ProcessedResume,
  ResultMetadata,
} from 'src/types'
import { ConfigService } from '@nestjs/config'
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { AIMessage } from '@langchain/core/messages'
import { GraphAnnotation } from 'src/types'
import { graph } from './orchestration.graph'

// Import the tool factory and zod for input validation
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// Define input schemas for email and attachment content
const emailContentSchema = z.object({
  body: z.string().min(1),
  subject: z.string().min(1),
  sender: z.string().email(),
  recipients: z.array(z.string().email()).min(1),
})

const attachmentMetadataSchema = z.object({
  file_type: z.string().min(1),
  file_name: z.string().min(1),
})

const attachmentSchema = z.object({
  content: z.string().min(1),
  metadata: attachmentMetadataSchema,
})

// -----------------------------------------------------------------------------
// 1. Classification Tool (existing implementation)
// -----------------------------------------------------------------------------
const apiKey = process.env.OPENAI_API_KEY

const extractJSON = (text: string) => {
  // Remove markdown code block indicators if present
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '')

  // Find the first { and last } to extract just the JSON object
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start === -1 || end === -1) {
    throw new Error('No valid JSON object found in response')
  }

  return text.slice(start, end + 1)
}

export const createClassificationTool = () => {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
    openAIApiKey: apiKey,
    streaming: false,
  })

  const systemPrompt = `You are an expert email attachment classifier. Your task is to analyze emails and their attachments 
    to determine their type. Carefully examine both the email content and attachment details before making 
    a classification.

    Classification Categories:
    1. Resume: 
       - Look for: personal information, work experience, education, skills sections
       - Keywords: CV, experience, qualifications, employment history
       
    2. Contract: 
       - Look for: legal terms, parties involved, agreement clauses, signatures
       - Keywords: agreement, terms, conditions, parties, signed
       
    3. Job Description: 
       - Look for: role requirements, responsibilities, qualifications
       - Keywords: position, role, requirements, qualifications, responsibilities
       
    4. Invoice: 
       - Look for: billing information, amounts, payment terms, due dates
       - Keywords: payment, amount, due date, billing, invoice number
       
    5. Other: 
       - Use when the document doesn't clearly fit into above categories
       - Provide detailed reasoning for why it doesn't match other categories
    
    Respond with ONLY a JSON object in the following format:
    {
      "type": "Resume" | "Contract" | "Job Description" | "Invoice" | "Other",
      "confidence": number between 0 and 1,
      "reasoning": "brief explanation"
      "needs_processing":true
    }
    Always set the "needs_processing" field as true.
    Do not include any markdown formatting, just the raw JSON object.
    Provide high confidence (>0.8) only when there are clear indicators of the document type.
    Always explain your reasoning based on specific evidence from the email and attachments.`

  return tool(
    async (input: { email_content: any; attachments: any[] }) => {
      console.log(
        'Inside classification tool with input:',
        JSON.stringify(input, null, 2),
      )

      try {
        // Validate input
        const validatedEmail = emailContentSchema.parse(input.email_content)
        const validatedAttachments = z
          .array(attachmentSchema)
          .parse(input.attachments)

        // Format attachment info
        const attachmentInfo = validatedAttachments
          .map(
            (a) =>
              `${a.metadata.file_name} (${a.metadata.file_type}): ${a.content.substring(0, 500)}...`,
          )
          .join('\n')

        // Create messages for the model
        const messages = [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Analyze this email and its attachments:
              Subject: ${validatedEmail.subject}
              Body: ${validatedEmail.body}
              Attachments: ${attachmentInfo}
              
              Provide your classification with confidence score and detailed reasoning.`,
          },
        ]

        // Get model response
        const response = await model.invoke(messages)
        console.log('tool response', response)
        let content = response.content

        // Handle different content types
        if (typeof content !== 'string') {
          content = Array.isArray(content)
            ? content.join('')
            : JSON.stringify(content)
        }

        // Extract and parse JSON
        const jsonStr = extractJSON(content)
        console.log(jsonStr)
        const classification = JSON.parse(jsonStr)
        console.log(classification)

        const newCommand = new Command({
          update: {
            classification: {
              type: classification.type,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              needs_processing:classification.needs_processing
            },
          },
        })
        console.log('tool update', newCommand)
        return newCommand
      } catch (error) {
        console.error('Classification error:', error)
        return new Command({
          update: {
            classification: {
              type: 'Other',
              confidence: 0,
              reasoning:
                error instanceof Error
                  ? `Classification failed: ${error.message}`
                  : 'Classification failed with unknown error',
            },
          },
        })
      }
    },
    {
      name: 'email-attachment-analyser',
      description:
        'Analyzes email content and attachments to classify their type and purpose.',
      schema: z.object({
        email_content: emailContentSchema,
        attachments: z.array(attachmentSchema),
      }),
    },
  )
}

export const classificationTool = createClassificationTool()

// -----------------------------------------------------------------------------
// 2. Resume Processing Tool
// -----------------------------------------------------------------------------
export const resumeTool = tool(
  async (input: { email_content: any; attachments: any[] }) => {
    console.log('Inside resumeTool with input:', JSON.stringify(input, null, 2))
    // Dummy processing logic for resumes
    return new Command({
      update: {
        processed_data: { type: 'resume', data: { dummy: true } },
        classification:{
          needs_processing:false
        }
      },
    })
  },
  {
    name: 'process_resume',
    description: 'Processes resumes by extracting relevant information.',
    schema: z.object({
      email_content: emailContentSchema,
      attachments: z.array(attachmentSchema),
    }),
  },
)

// -----------------------------------------------------------------------------
// 3. Invoice Processing Tool
// -----------------------------------------------------------------------------
export const invoiceTool = tool(
  async (input: { email_content: any; attachments: any[] }) => {
    console.log('Inside invoiceTool with input:', JSON.stringify(input, null, 2))
    // Dummy processing logic for invoices
    return new Command({
      update: {
        processed_data: { type: 'invoice', data: { dummy: true } },
      },
    })
  },
  {
    name: 'process_invoice',
    description: 'Processes invoices by extracting billing information and amounts.',
    schema: z.object({
      email_content: emailContentSchema,
      attachments: z.array(attachmentSchema),
    }),
  },
)

// -----------------------------------------------------------------------------
// 4. Job Description Processing Tool
// -----------------------------------------------------------------------------
export const jobDescriptionTool = tool(
  async (input: { email_content: any; attachments: any[] }) => {
    console.log('Inside jobDescriptionTool with input:', JSON.stringify(input, null, 2))
    // Dummy processing logic for job descriptions
    return new Command({
      update: {
        processed_data: { type: 'job_description', data: { dummy: true } },
      },
    })
  },
  {
    name: 'process_job_description',
    description: 'Processes job descriptions by extracting role requirements and qualifications.',
    schema: z.object({
      email_content: emailContentSchema,
      attachments: z.array(attachmentSchema),
    }),
  },
)

// -----------------------------------------------------------------------------
// 5. Contract Processing Tool
// -----------------------------------------------------------------------------
export const contractTool = tool(
  async (input: { email_content: any; attachments: any[] }) => {
    console.log('Inside contractTool with input:', JSON.stringify(input, null, 2))
    // Dummy processing logic for contracts
    return new Command({
      update: {
        processed_data: { type: 'contract', data: { dummy: true } },
      },
    })
  },
  {
    name: 'process_contract',
    description: 'Processes contracts by extracting legal terms and agreement details.',
    schema: z.object({
      email_content: emailContentSchema,
      attachments: z.array(attachmentSchema),
    }),
  },
)

// -----------------------------------------------------------------------------
// 6. Export ALL_TOOLS_LIST with all defined tools
// -----------------------------------------------------------------------------
export const ALL_TOOLS_LIST = [
  classificationTool,
  resumeTool,
  invoiceTool,
  jobDescriptionTool,
  contractTool,
]
