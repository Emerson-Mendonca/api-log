// src/services/cron.service.ts
import cron from 'node-cron';
import { RabbitMQService } from './rabbitmq.service';
import { ElasticsearchService } from './elasticsearch.service';
import { Message } from '../models/message.model';
import { v4 as uuidv4 } from 'uuid';

export class CronService {
  private rabbitmqService: RabbitMQService;
  private elasticsearchService: ElasticsearchService;
  private cronJobs: cron.ScheduledTask[] = [];

  constructor(
    rabbitmqService: RabbitMQService,
    elasticsearchService: ElasticsearchService
  ) {
    this.rabbitmqService = rabbitmqService;
    this.elasticsearchService = elasticsearchService;
  }

  /**
   * Inicializa o job de cron para processar mensagens da fila
   * @param schedule Expressão cron (default: a cada 1 minuto)
   */
  startQueueProcessingJob(schedule: string = '* * * * *'): void {
    const job = cron.schedule(schedule, async () => {
      console.log(`[${new Date().toISOString()}] Iniciando transferência entre filas`);
      await this.transferQueueMessages(20)

      console.log(`[${new Date().toISOString()}] Iniciando processamento de fila para Elasticsearch`);
      await this.processQueueToElasticsearch();
    });

    this.cronJobs.push(job);
    console.log(`Job de processamento de fila configurado: ${schedule}`);
  }

  /**
   * Processa manualmente mensagens da fila para o Elasticsearch
   */
  async processQueueToElasticsearch(): Promise<void> {
    try {
      // Obtém mensagens da fila de entrada usando um método modificado do RabbitMQService
      const messages = await this.rabbitmqService.getMessagesFromQueue(10); // limita a 10 mensagens por vez

      if (messages.length === 0) {
        console.log('Nenhuma mensagem na fila para processar');
        return;
      }

      console.log(`Processando ${messages.length} mensagens da fila`);

      // Processa cada mensagem e envia para Elasticsearch
      for (const message of messages) {
        try {
          // Indexa no Elasticsearch
          await this.elasticsearchService.indexMessage(message);

          // Opcionalmente, envie para a fila de saída indicando que foi processado
          const processedMessage: Message = {
            ...message,
            processed: true,
            processedAt: Date.now()
          };

          await this.rabbitmqService.publishMessage(processedMessage);

          // Confirma o processamento da mensagem original
          await this.rabbitmqService.acknowledgeMessage(message.id);

          console.log(`Mensagem ${message.id} processada e indexada com sucesso`);
        } catch (error) {
          console.error(`Erro ao processar mensagem ${message.id}:`, error);
          // Se falhar, podemos recolocar na fila ou mover para uma fila de mensagens mortas
          await this.rabbitmqService.rejectMessage(message.id);
        }
      }

      console.log(`Processamento de lote concluído: ${messages.length} mensagens`);
    } catch (error) {
      console.error('Erro ao processar fila para Elasticsearch:', error);
    }
  }

  /**
   * Inicia um job de heartbeat para verificar a saúde dos serviços
   */
  startHeartbeatJob(schedule: string = '*/5 * * * *'): void {
    const job = cron.schedule(schedule, async () => {
      try {
        console.log(`[${new Date().toISOString()}] Verificando saúde dos serviços`);

        // Verificar RabbitMQ
        const rabbitmqHealth = await this.rabbitmqService.checkHealth();

        // Verificar Elasticsearch
        const esHealth = await this.elasticsearchService.checkHealth();

        console.log(`Status dos serviços: RabbitMQ: ${rabbitmqHealth ? 'OK' : 'ERRO'}, Elasticsearch: ${esHealth ? 'OK' : 'ERRO'}`);

        // Se algum serviço estiver com problemas, podemos tentar reconectar
        if (!rabbitmqHealth) {
          console.log('Tentando reconectar ao RabbitMQ...');
          await this.rabbitmqService.initialize();
        }

        if (!esHealth) {
          console.log('Tentando reconectar ao Elasticsearch...');
          await this.elasticsearchService.initialize();
        }
      } catch (error) {
        console.error('Erro ao executar verificação de saúde:', error);
      }
    });

    this.cronJobs.push(job);
    console.log(`Job de heartbeat configurado: ${schedule}`);
  }

  // Função para transferir mensagens entre filas usando o CronService
  async transferQueueMessages(batchSize: number = 10): Promise<void> {
    try {
      // Obtém mensagens da fila de entrada (RABBITMQ_QUEUE_CONSUME)
      const messages = await this.rabbitmqService.getMessagesFromQueue(batchSize);

      if (messages.length === 0) {
        console.log('Nenhuma mensagem na fila de origem para transferir');
        return;
      }

      console.log(`Transferindo ${messages.length} mensagens entre filas`);

      // Processa cada mensagem e transfere para a fila de destino
      for (const message of messages) {
        try {
          // Publica na fila de destino (RABBITMQ_QUEUE_PUBLISH)
          await this.rabbitmqService.publishMessage(message);

          // Confirma o processamento da mensagem na fila de origem
          await this.rabbitmqService.acknowledgeMessage(message.id);

          console.log(`Mensagem ${message.id} transferida com sucesso`);
        } catch (error) {
          console.error(`Erro ao transferir mensagem ${message.id}:`, error);
          // Se falhar, rejeitamos a mensagem
          await this.rabbitmqService.rejectMessage(message.id);
        }
      }

      console.log(`Transferência de lote concluída: ${messages.length} mensagens`);
    } catch (error) {
      console.error('Erro ao transferir mensagens entre filas:', error);
    }
  }

  /**
   * Para todos os jobs de cron
   */
  stopAllJobs(): void {
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    console.log('Todos os jobs de cron foram interrompidos');
  }
}