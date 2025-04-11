// src/services/cron.service.ts
import cron from 'node-cron';
import { rabbitmqConfig } from '../config/rabbitmq.config';
import { Message } from '../models/message.model';
import { ElasticsearchService } from './elasticsearch.service';
import { RabbitMQService } from './rabbitmq.service';

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
      const messages = await this.rabbitmqService.getMessagesFromQueue(20, rabbitmqConfig.queueToConsume);

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

  /**
   * Para todos os jobs de cron
   */
  stopAllJobs(): void {
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    console.log('Todos os jobs de cron foram interrompidos');
  }


  /**
   * Processa todas as mensagens continuamente em vez de usar um job cron
   * Esta função roda em loop contínuo até ser interrompida
   */
  async processAllMessages(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Iniciando processamento contínuo de mensagens`);

    // Indica se o processamento está ativo
    let isProcessing = true;

    // Manipulador para SIGINT e SIGTERM para parar graciosamente
    const shutdown = () => {
      console.log('Recebido sinal de desligamento, finalizando processamento...');
      isProcessing = false;
    };

    // Registra handlers para sinais de término
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Loop de processamento contínuo
    while (isProcessing) {
      try {
        // Obtém até 20 mensagens por vez
        const messages = await this.rabbitmqService.getMessagesFromQueue(20, rabbitmqConfig.queueToPublish);

        if (messages.length === 0) {
          console.log('Nenhuma mensagem para processar, aguardando 5 segundos...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        console.log(`Processando lote de ${messages.length} mensagens`);

        let successCount = 0;
        let errorCount = 0;

        // Processa em sub-lotes para melhor gerenciamento de memória
        const subBatchSize = 20;
        for (let i = 0; i < messages.length; i += subBatchSize) {
          const subBatch = messages.slice(i, i + subBatchSize);

          // Processa o sub-lote
          await Promise.all(subBatch.map(async (message) => {
            try {
              // Publica na fila de destino
              await this.rabbitmqService.publishMessage(message,rabbitmqConfig.queueToConsume);

              // Confirma o processamento da mensagem na fila de origem
              await this.rabbitmqService.acknowledgeMessage(message.id);

              successCount++;
            } catch (error) {
              console.error(`Erro ao transferir mensagem ${message.id}:`, error);
              await this.rabbitmqService.rejectMessage(message.id, false);
              errorCount++;
            }
          }));

          // Log de progresso
          console.log(`Progresso: ${i + subBatch.length}/${messages.length} mensagens`);
        }

        console.log(`Lote processado: ${successCount} sucesso, ${errorCount} falhas`);
      } catch (error) {
        console.error('Erro no loop de processamento:', error);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('Processamento contínuo finalizado');
  }

  /**
   * Inicia o processamento contínuo como um processo em background
   */
  startContinuousProcessing(): void {
    // Executa o processamento em uma promise separada
    this.processAllMessages().catch(error => {
      console.error('Erro no processamento contínuo:', error);
    });

    console.log('Processamento contínuo iniciado');
  }
}