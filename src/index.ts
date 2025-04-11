// src/index.ts
import { Application } from './app';

const app = new Application();

async function bootstrap() {
  try {
    await app.start();
    
    // Capturar sinais para encerramento gracioso
    process.on('SIGINT', async () => {
      console.log('Sinal SIGINT recebido, encerrando aplicação...');
      await app.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Sinal SIGTERM recebido, encerrando aplicação...');
      await app.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Erro fatal:', error);
    process.exit(1);
  }
}

bootstrap();