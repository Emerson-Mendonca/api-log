import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiConfig } from '../config/api.config';
import { errorHandler } from '../middlewares/error.middleware';
import { RabbitMQService } from '../services/rabbitmq.service';
import { createMessageRoutes } from '../routes/message.routes';

export class ApiService {
  private app: Express;
  private rabbitmqService: RabbitMQService;
  private server: any;

  constructor(rabbitmqService: RabbitMQService) {
    this.app = express();
    this.rabbitmqService = rabbitmqService;
    this.configureMiddlewares();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  private configureMiddlewares(): void {
    // Middlewares para segurança e processamento de requisições
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private configureRoutes(): void {
    // Rota de verificação de saúde da API
    this.app.get(`${apiConfig.basePath}/health`, (req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // Configurar rotas de mensagens
    this.app.use(
      apiConfig.basePath,
      createMessageRoutes(this.rabbitmqService)
    );
  }

  private configureErrorHandling(): void {
    // Middleware de tratamento de erros (sempre deve ser o último)
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(apiConfig.port, () => {
        console.log(`API rodando em http://${apiConfig.host}:${apiConfig.port}${apiConfig.basePath}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error) => {
          if (err) {
            return reject(err);
          }
          console.log('Servidor HTTP encerrado com sucesso');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
