import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { rabbitmqConfig } from '../config/rabbitmq.config';
import { ApiError } from '../middlewares/error.middleware';
import { Message } from '../models/message.model';
import { RabbitMQService } from '../services/rabbitmq.service';

export class MessageController {
  private rabbitmqService: RabbitMQService;

  constructor(rabbitmqService: RabbitMQService) {
    this.rabbitmqService = rabbitmqService;
  }

  async publishMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = req.body;
      
      // Validação básica
      if (!payload || Object.keys(payload).length === 0) {
        const error: ApiError = new Error('Payload vazio ou inválido');
        error.statusCode = 400;
        throw error;
      }
      
      // Criar uma mensagem estruturada
      const message: Message = {
        id: payload.id || uuidv4(),
        content: payload,
        timestamp: Date.now(),
        updateTimestamp: Date.now()
      };
      
      // Publicar na fila do RabbitMQ
      await this.rabbitmqService.publishMessage(message, rabbitmqConfig.queueToPublish);
      
      // Responder ao cliente
      res.status(202).json({
        status: 'success',
        message: 'Mensagem enviada para processamento',
        messageId: message.id
      });
    } catch (error) {
      next(error);
    }
  }
}