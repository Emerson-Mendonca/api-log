import { ElasticsearchService } from './services/elasticsearch.service';
import { RabbitMQService } from './services/rabbitmq.service';
import { MessageHandler } from './handlers/message.handler';
import { ApiService } from './api/api.service';
import { CronService } from './services/cron.service';

export class Application {
  private elasticsearchService: ElasticsearchService;
  private rabbitmqService: RabbitMQService;
  private messageHandler: MessageHandler;
  private apiService: ApiService;
  private cronService: CronService;

  constructor() {
    this.elasticsearchService = new ElasticsearchService();
    this.rabbitmqService = new RabbitMQService();
    this.messageHandler = new MessageHandler(
      this.elasticsearchService,
      this.rabbitmqService
    );
    this.apiService = new ApiService(this.rabbitmqService);
    this.cronService = new CronService(
      this.rabbitmqService,
      this.elasticsearchService
    );
  }

  async start(): Promise<void> {
    try {
      // Inicializar serviços
      await this.elasticsearchService.initialize();
      await this.rabbitmqService.initialize();
    
      // Iniciar serviço de cron

      this.cronService.startContinuousProcessing();

      // Processar a fila a cada minuto
      this.cronService.startQueueProcessingJob('*/1 * * * *');
      // Verificar saúde dos serviços a cada 5 minutos
      this.cronService.startHeartbeatJob('*/5 * * * *');
      
      // Iniciar API HTTP
      await this.apiService.start();
      
      console.log('Aplicação iniciada com sucesso!');
    } catch (error) {
      console.error('Erro ao iniciar a aplicação:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      // Parar jobs cron
      this.cronService.stopAllJobs();
      
      // Encerrar API
      await this.apiService.stop();
      
      // Encerrar RabbitMQ
      await this.rabbitmqService.close();
      
      console.log('Aplicação encerrada com sucesso');
    } catch (error) {
      console.error('Erro ao encerrar a aplicação:', error);
      throw error;
    }
  }
}