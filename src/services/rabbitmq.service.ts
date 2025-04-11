// src/services/rabbitmq.service.ts
import * as amqp from 'amqplib';
import { rabbitmqConfig } from '../config/rabbitmq.config';
import { Message } from '../models/message.model';

export class RabbitMQService {
  private connection: any = null;
  private consumeChannel: any = null;
  private publishChannel: any = null;
  private deadLetterChannel: any = null;
  private processingMessages: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    try {
      // Inicializar conexão e canais principais (códigos existentes)
      this.connection = await amqp.connect(rabbitmqConfig.url);

      // Configurar canal de consumo
      this.consumeChannel = await this.connection.createChannel();

      // Configurar dead letter exchange se configurado
      if (rabbitmqConfig.deadLetterQueue) {
        const deadLetterExchange = 'dead.letter.exchange';

        // Configurar canal para mensagens mortas
        this.deadLetterChannel = await this.connection.createChannel();

        // Declarar exchange e fila para mensagens mortas
        await this.deadLetterChannel.assertExchange(deadLetterExchange, 'direct', { durable: true });
        await this.deadLetterChannel.assertQueue(rabbitmqConfig.deadLetterQueue, { durable: true });
        await this.deadLetterChannel.bindQueue(
          rabbitmqConfig.deadLetterQueue,
          deadLetterExchange,
          'dead.letter.routing.key'
        );

        // Configurar fila principal com dead letter exchange
        await this.consumeChannel.assertQueue(rabbitmqConfig.queueToConsume, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': deadLetterExchange,
            'x-dead-letter-routing-key': 'dead.letter.routing.key'
          }
        });
      } else {
        // Configuração padrão sem dead letter
        await this.consumeChannel.assertQueue(rabbitmqConfig.queueToConsume, { durable: true });
      }

      await this.consumeChannel.prefetch(rabbitmqConfig.prefetch);

      // Configurar canal de publicação
      this.publishChannel = await this.connection.createChannel();
      await this.publishChannel.assertQueue(rabbitmqConfig.queueToPublish, { durable: true });

      console.log('Conexão com RabbitMQ estabelecida');

      // Setup eventos de reconexão (código existente)
      this.connection.on('error', (err: Error) => {
        console.error('Erro na conexão RabbitMQ:', err);
        this.reconnect();
      });

      this.connection.on('close', () => {
        console.log('Conexão RabbitMQ fechada, tentando reconectar...');
        this.reconnect();
      });
    } catch (error) {
      console.error('Falha ao conectar ao RabbitMQ:', error);
      this.reconnect();
    }
  }

  private reconnect(): void {
    setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        console.error('Falha ao reconectar ao RabbitMQ:', error);
      }
    }, rabbitmqConfig.reconnectTimeout);
  }

  async consumeMessages(
    messageHandler: (message: Message) => Promise<void>
  ): Promise<void> {
    if (!this.consumeChannel) {
      throw new Error('Canal de consumo não inicializado');
    }

    this.consumeChannel.consume(
      rabbitmqConfig.queueToConsume,
      async (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            const message: Message = {
              id: content.id || `msg-${Date.now()}`,
              content: content.content,
              timestamp: content.timestamp,
              updateTimestamp: content.updateTimestamp || Date.now()
            };

            await messageHandler(message);
            this.consumeChannel?.ack(msg);
          } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            // Rejeita a mensagem e a envia de volta para a fila após um delay
            this.consumeChannel?.nack(msg, false, true);
          }
        }
      },
      { noAck: false }
    );

    console.log(`Consumindo mensagens da fila: ${rabbitmqConfig.queueToConsume}`);
  }

  async publishMessage(message: Message, fila: String): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Canal de publicação não inicializado');
    }

    try {
      await this.publishChannel.sendToQueue(
        fila,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
      console.log(`Mensagem ${message.id} publicada na fila ${rabbitmqConfig.queueToPublish}`);
    } catch (error) {
      console.error('Erro ao publicar mensagem:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.consumeChannel) await this.consumeChannel.close();
      if (this.publishChannel) await this.publishChannel.close();
      if (this.connection) await this.connection.close();
    } catch (error) {
      console.error('Erro ao fechar conexão RabbitMQ:', error);
    }
  }
  /**
     * Obtém um conjunto de mensagens da fila para processamento em lote
     * @param maxMessages Número máximo de mensagens para obter
     */
  async getMessagesFromQueue(maxMessages: number = 20, fila: String): Promise<Message[]> {
    if (!this.consumeChannel) {
      await this.initialize();
      if (!this.consumeChannel) {
        throw new Error('Canal de consumo não inicializado');
      }
    }

    const messages: Message[] = [];

    await this.consumeChannel.prefetch(maxMessages);

    for (let i = 0; i < maxMessages; i++) {
      try {
        // Método get do canal para obter uma mensagem única (sem consumo contínuo)
        const msg = await this.consumeChannel.get(fila, { noAck: false });

        if (!msg) {
          console.log(`Obtidas ${messages.length} mensagens, não há mais mensagens na fila`);
          break;
        }

        const content = JSON.parse(msg.content.toString());
        const messageId = content.id || `msg-${Date.now()}-${i}`;


        content.updateTimestamp || Date.now()

        this.processingMessages.set(messageId, msg);

        messages.push(content);
      } catch (error) {
        console.error('Erro ao obter mensagem da fila:', error);
        break;
      }
    }

    return messages;
  }

  /**
   * Confirma o processamento de uma mensagem específica
   * @param messageId ID da mensagem a ser confirmada
   */
  async acknowledgeMessage(messageId: string): Promise<boolean> {
    if (!this.consumeChannel) {
      throw new Error('Canal de consumo não inicializado');
    }

    const originalMessage = this.processingMessages.get(messageId);
    if (!originalMessage) {
      console.warn(`Mensagem ${messageId} não encontrada para confirmação`);
      return false;
    }

    try {
      this.consumeChannel.ack(originalMessage);
      this.processingMessages.delete(messageId);
      return true;
    } catch (error) {
      console.error(`Erro ao confirmar mensagem ${messageId}:`, error);
      return false;
    }
  }

  /**
   * Rejeita uma mensagem, potencialmente movendo para uma fila de mensagens mortas
   * @param messageId ID da mensagem a ser rejeitada
   * @param requeue Se true, recoloca a mensagem na fila original
   */
  async rejectMessage(messageId: string, requeue: boolean = false): Promise<boolean> {
    if (!this.consumeChannel) {
      throw new Error('Canal de consumo não inicializado');
    }

    const originalMessage = this.processingMessages.get(messageId);
    if (!originalMessage) {
      console.warn(`Mensagem ${messageId} não encontrada para rejeição`);
      return false;
    }

    try {
      // Se não for para recolocar na fila e temos um canal para dead letter
      if (!requeue && this.deadLetterChannel) {
        // Publicar na fila de mensagens mortas antes de rejeitar
        const content = JSON.parse(originalMessage.content.toString());
        await this.deadLetterChannel.sendToQueue(
          rabbitmqConfig.deadLetterQueue || 'dead_letter_queue',
          Buffer.from(JSON.stringify({
            ...content,
            _meta: {
              rejectedAt: new Date().toISOString(),
              originalQueue: rabbitmqConfig.queueToConsume
            }
          })),
          { persistent: true }
        );
      }

      // Rejeitar a mensagem original
      this.consumeChannel.nack(originalMessage, false, requeue);
      this.processingMessages.delete(messageId);
      return true;
    } catch (error) {
      console.error(`Erro ao rejeitar mensagem ${messageId}:`, error);
      return false;
    }
  }

  /**
   * Verifica a saúde da conexão com RabbitMQ
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.connection || !this.consumeChannel || !this.publishChannel) {
        return false;
      }

      // Tentar obter informações da fila para verificar conectividade
      await this.consumeChannel.checkQueue(rabbitmqConfig.queueToConsume);
      await this.publishChannel.checkQueue(rabbitmqConfig.queueToPublish);

      return true;
    } catch (error) {
      console.error('Erro na verificação de saúde do RabbitMQ:', error);
      return false;
    }
  }


}