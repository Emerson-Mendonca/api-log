import dotenv from 'dotenv';
dotenv.config();

export const rabbitmqConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  queueToConsume: process.env.RABBITMQ_QUEUE_CONSUME || 'input_queue',
  queueToPublish: process.env.RABBITMQ_QUEUE_PUBLISH || 'output_queue',
  deadLetterQueue: process.env.RABBITMQ_DEAD_LETTER_QUEUE || 'dead_letter_queue',
  prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '10'),
  reconnectTimeout: parseInt(process.env.RABBITMQ_RECONNECT_TIMEOUT || '5000'),
  processingSchedule: process.env.RABBITMQ_PROCESSING_SCHEDULE || '*/1 * * * *' // a cada 1 minuto
};