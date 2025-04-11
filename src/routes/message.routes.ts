import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { RabbitMQService } from '../services/rabbitmq.service';

export function createMessageRoutes(rabbitmqService: RabbitMQService): Router {
  const router = Router();
  const messageController = new MessageController(rabbitmqService);
  
  router.post('/messages', messageController.publishMessage.bind(messageController));
  
  return router;
}