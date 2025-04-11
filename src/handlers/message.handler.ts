import { rabbitmqConfig } from '../config/rabbitmq.config';
import { Message } from '../models/message.model';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { RabbitMQService } from '../services/rabbitmq.service';

export class MessageHandler {
  private elasticsearchService: ElasticsearchService;
  private rabbitmqService: RabbitMQService;

  constructor(
    elasticsearchService: ElasticsearchService,
    rabbitmqService: RabbitMQService
  ) {
    this.elasticsearchService = elasticsearchService;
    this.rabbitmqService = rabbitmqService;
  }

  async handleMessage(message: Message): Promise<void> {
    try {
      // 1. Indexar mensagem no Elasticsearch
      await this.elasticsearchService.indexMessage(message);

      // 2. Transformar mensagem se necessário
      const processedMessage: Message = {
        ...message,
        processed: true,
        processedAt: Date.now()
      };

      // 3. Publicar mensagem processada na fila de saída
      await this.rabbitmqService.publishMessage(processedMessage, rabbitmqConfig.queueToPublish);

      console.log(`Mensagem ${message.id} processada com sucesso`);
    } catch (error) {
      console.error(`Erro ao processar mensagem ${message.id}:`, error);
      throw error;
    }
  }
}