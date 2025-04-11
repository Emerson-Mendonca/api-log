import { Client } from '@elastic/elasticsearch';
import { elasticsearchConfig } from '../config/elasticsearch.config';
import { Message } from '../models/message.model';

export class ElasticsearchService {
  private client: Client;

  constructor() {
    this.client = new Client({
      node: elasticsearchConfig.node,
      auth: elasticsearchConfig.auth.username ? {
        username: elasticsearchConfig.auth.username,
        password: elasticsearchConfig.auth.password
      } : undefined
    });
  }

  async initialize(): Promise<void> {
    try {
      const indexExists = await this.client.indices.exists({
        index: elasticsearchConfig.index
      });

      if (!indexExists) {
        await this.client.indices.create({
          index: elasticsearchConfig.index,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                content: { type: 'object' },
                timestamp: { type: 'date' }
              }
            }
          }
        });
        console.log(`Índice ${elasticsearchConfig.index} criado.`);
      }
    } catch (error) {
      console.error('Erro ao inicializar Elasticsearch:', error);
      throw error;
    }
  }

  async indexMessage(message: Message): Promise<void> {
    try {
      await this.client.index({
        index: elasticsearchConfig.index,
        id: message.id,
        body: message
      });
      console.log(`Mensagem ${message.id} indexada no Elasticsearch`);
    } catch (error) {
      console.error('Erro ao indexar mensagem:', error);
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const healthResponse = await this.client.cluster.health();
      
      // Verificar se o status não está vermelho (o que indica problemas sérios)
      return healthResponse.status !== 'red';
    } catch (error) {
      console.error('Erro na verificação de saúde do Elasticsearch:', error);
      return false;
    }
  }
}