/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common'
import { Annotation, Command, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import {
  Attachment,
  Classification,
  EmailContent,
  ProcessedContract,
  ProcessedInvoice,
  ProcessedResume,
  ResultMetadata,
} from 'src/types'
import { ConfigService } from '@nestjs/config'
// import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ALL_TOOLS_LIST, classificationTool, createClassificationTool, } from './tools'
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { AIMessage } from '@langchain/core/messages'
import { GraphAnnotation } from 'src/types'
import { graph } from './orchestration.graph'


// Define the root annotation structure


@Injectable()
export class OrchestrationAgent {
    private openai: ChatOpenAI
  private readonly logger = new Logger(OrchestrationAgent.name)
  // private toolNode=new ToolNode(tools)
  public toolNode: ToolNode;
  private readonly model:ChatOpenAI
  private classificationChain: RunnableSequence;
  private readonly apiKey:string
  private graph;
  private classificationTool
  private llmwithtools;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')
    // this.initializeGraph();
    this.openai=new ChatOpenAI({
      apiKey:this.apiKey,
      modelName:'gpt-4o-mini',
      temperature:0,
      streaming: false,
    })
    // this.classificationTool = createClassificationTool(apiKey);
    this.toolNode = new ToolNode(ALL_TOOLS_LIST);
  }

  private initializeGraph() {
    try {
      this.graph = new StateGraph(GraphAnnotation)
      .addNode("classify", this.callModel.bind(this))
      .addNode("processDocument",this.processDocument.bind(this))
      // .addNode("process_resume", this.process_resume.bind(this))
      // .addNode("process_invoice", this.process_invoice.bind(this))
      // .addNode("process_job_description", this.process_job_description.bind(this))
      // .addNode("process_contract", this.process_contract.bind(this))
      .addNode("finalize", this.finalizeNode.bind(this))
      .addNode('tools', this.toolNode)
      .addEdge(START, "classify")
      // .addEdge("process_resume", "finalize")
      // .addEdge("process_invoice", "finalize")
      // .addEdge("process_job_description", "finalize")
      // .addEdge("process_contract", "finalize")
      .addEdge("tools", "processDocument")
      .addConditionalEdges(
        "classify",
        (state: typeof GraphAnnotation.State) => {
          if (state.classification) {
            this.logger.log('Routing based on classification:', state.classification);
            switch (state.classification.type) {
              case 'Resume':
                return "process_resume";
              case 'Contract':
                return "process_contract";
              case 'Invoice':
                return "process_invoice";
              case 'Job Description':
                return "process_job_description";
              default:
                return "finalize";
            }
          }
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg?.additional_kwargs.tool_calls.length) {
            return "tools";
          }
          return "finalize";
        }
      )
      .compile();

  
    } catch (error) {
      this.logger.error('Error initializing graph:', error);
      throw error;
    }
  }
  // private initializeProcessingGraph(){
  //   try{
  //     this
  //   }catch(error){

  //   }
  // }
// Update the runGraph method:
public async runGraph(inputData: {
  email_content: EmailContent;
  attachments: Attachment[];
}) {
  this.logger.log('Running graph with input:', JSON.stringify(inputData));
  
  try {
    this.initializeGraph();
    
    const initialState = {
      input: {
        email_content: inputData.email_content,
        attachments: inputData.attachments || [],
      },
      classification: undefined,
      processed_data: undefined,
      errors: [],
      warnings: [],
      result: undefined,
    };

    const result = await this.graph.invoke(initialState);
    this.logger.log('Graph execution completed:', JSON.stringify(result));
    return result;
  } catch (error) {
    this.logger.error('Error running graph:', error);
    throw error;
  }
}

// private classifyNode = async (state: typeof GraphAnnotation.State) => {
//   this.logger.log("Inside classifyNode with state:", JSON.stringify(state.input));
  
//   try {
//     const command = await this.toolNode.invoke(state.input);
//     this.logger.log("Classification result:", JSON.stringify(command));
//     return command instanceof Command ? command : new Command(command);
//   } catch (error) {
//     this.logger.error('Classification error:', error);
//     return new Command({
//       update: {
//         errors: [`Classification failed: ${error.message}`],
//         classification: {
//           type: 'Other',
//           confidence: 0,
//           reasoning: `Error during classification: ${error.message}`
//         }
//       }
//     });
//   }
// };

    /**
   * Dummy node method for processing resumes.
   * Simply logs and returns a Command that updates the state with a message
   * so you can verify the flow.
   */
    // public process_resume = async (state: typeof GraphAnnotation.State) => {
    //   this.logger.log('Inside process_resume node...')
    //   return new Command({
    //     update: {
    //       processed_data: { type: 'resume', data: { dummy: true } }
    //     }
    //   })
    // }
  
    // /**
    //  * Dummy node method for processing invoices.
    //  */
    // public process_invoice = async (state: typeof GraphAnnotation.State) => {
    //   this.logger.log('Inside process_invoice node...')
    //   return new Command({
    //     update: {
    //       processed_data: { type: 'invoice', data: { dummy: true } }
    //     }
    //   })
    // }
  
    // /**
    //  * Dummy node method for processing job descriptions.
    //  */
    // public process_job_description = async (state: typeof GraphAnnotation.State) => {
    //   this.logger.log('Inside process_job_description node...')
    //   return new Command({
    //     update: {
    //       processed_data: { type: 'job_description', data: { dummy: true } }
    //     }
    //   })
    // }
  
    // /**
    //  * Dummy node method for processing contracts.
    //  */
    // public process_contract = async (state: typeof GraphAnnotation.State) => {
    //   this.logger.log('Inside process_contract node...')
    //   return new Command({
    //     update: {
    //       processed_data: { type: 'contract', data: { dummy: true } }
    //     }
    //   })
    // }
  
    /**
     * Dummy node method to finalize the result.
     * You could combine processed_data, classification, etc., into a final output.
     */
    public finalizeNode = async (state: typeof GraphAnnotation.State) => {
      this.logger.log('Inside finalize node...')
      return new Command({
        update: {
          result: {
            attachment_type: state.classification?.type ?? 'Unknown',
            processed_data: state.processed_data,
            metadata: {
              confidence: state.classification?.confidence ?? null,
              explanation: state.classification?.reasoning ?? 'No reasoning provided',
            },
          }
        }
      })
    }

    // public classifyNode = async (state: typeof GraphAnnotation.State) => {
    //   this.logger.log('Inside classifyNode with state:', JSON.stringify(state));
  
    //   // If we already have a classification, return it
    //   if (state.classification) {
    //     this.logger.log('Using existing classification:', state.classification);
    //     return new Command({
    //       update: {
    //         classification: state.classification
    //       }
    //     });
    //   }
  
    //   // If we don't have a classification, we need to get one
    //   try {
    //     if (!this.openai) {
    //       this.openai = new ChatOpenAI({
    //         modelName: 'gpt-4o-mini',
    //         temperature: 0,
    //         openAIApiKey: this.configService.get<string>('OPENAI_API_KEY')
    //       });
    //     }
  
    //     this.llmwithtools = this.openai.bindTools(ALL_TOOLS_LIST);
    //     const prompt = ChatPromptTemplate.fromMessages([
    //       ["system", `
    //         You are an email processing agent. Analyze the email and its attachments, 
    //         then use the email-attachment-analyser tool to classify them.
            
    //         You MUST use the email-attachment-analyser tool to perform the classification.
    //         Do not try to classify directly - always use the tool.
            
    //         Return the classification and explanation of your decision.
    //       `],
    //       ["human", `Please analyze this email and attachments: {input}`]
    //     ]);
  
    //     this.classificationChain = RunnableSequence.from([
    //       {
    //         input: (state: any) => JSON.stringify({
    //           email_content: state.input.email_content,
    //           attachments: state.input.attachments
    //         })
    //       },
    //       prompt,
    //       this.llmwithtools
    //     ]);
        
    //     const result = await this.classificationChain.invoke({
    //       input: state.input
    //     });
  
    //     this.logger.log('New classification result:', result);
  
    //     const nodeCommand= new Command({
    //       update: {
    //         classification: {
    //           type: result.type || 'Other',
    //           confidence: result.confidence || 0,
    //           reasoning: result.reasoning || 'No reasoning provided'
    //         }
    //       }
    //     });
    //     this.logger.log("node state update",nodeCommand)
    //     return nodeCommand
    //   } catch (error) {
    //     this.logger.error('Classification error:', error);
    //     return new Command({
    //       update: {
    //         errors: [`Classification failed: ${error.message}`],
    //         classification: {
    //           type: 'Other',
    //           confidence: 0,
    //           reasoning: `Error during classification: ${error.message}`
    //         }
    //       }
    //     });
    //   }
    // };
    public callModel = async (state: typeof GraphAnnotation.State) => {
      if (state.classification?.needs_processing===false) {
        this.logger.log('Classification already exists, skipping LLM call');
        return new Command({
          update: {
            classification: state.classification
          }
        });
      }
      this.logger.log('Inside callModel with state:', JSON.stringify(state.input));
      
      const systemMessage = {
        role: "system",
        content: `You are an email processing agent. Your task is to analyze emails and attachments 
                  for classification. You MUST use the email-attachment-analyser tool to classify them. 
                  Always use the email-attachment-analyser tool first and only if needs_processing is true then call the other appropriate tools except for email-attachment-analyser tool and pass the exact email content and attachments provided.`
      };
    
      // Use the actual input data from state
      const userMessage = {
        role: "user",
        content: `Please analyze this email and its attachments: ${JSON.stringify(state.input)}`
      };
    
      const llmWithTools = this.openai.bindTools(ALL_TOOLS_LIST);
      const result = await llmWithTools.invoke([systemMessage, userMessage]);
      
      this.logger.log('LLM Response:',JSON.stringify(result.content));
      
      return { messages: [result] };
    };

    public processDocument = async (state: typeof GraphAnnotation.State) => {
      // If no processing is needed, skip and return the current processed_data.
      if (!state.classification?.needs_processing) {
        this.logger.log('No processing required, skipping processing call.');
        return new Command({
          update: { processed_data: state.processed_data }
        });
      }
    
      this.logger.log('Inside processDocument with state:', JSON.stringify(state.input));
    
      const systemMessage = {
        role: "system",
        content: `You are an email processing agent responsible for processing attachments based on the document classification.
    Your task now is to analyze the provided email and its attachments and to call the appropriate processing tool (such as process_resume, process_invoice, process_job_description, or process_contract) based on the existing classification.
    DO NOT call the email-attachment-analyser tool again. Instead, select and invoke one of the processing tools from the available tools list and pass along the exact email content and attachments.
    Return the tool call details in the same JSON format as expected.`
      };
    
      const userMessage = {
        role: "user",
        content: `The current classification is: ${JSON.stringify(state.classification)}.
    Please process the documents accordingly. Here is the email input:
    ${JSON.stringify(state.input)}`
      };
    
      const llmWithTools = this.openai.bindTools(ALL_TOOLS_LIST);
      const result = await llmWithTools.invoke([systemMessage, userMessage]);
    
      this.logger.log('LLM Processing Response:', JSON.stringify(result.content));
    
      return { messages: [result] };
    };
    
    
}
