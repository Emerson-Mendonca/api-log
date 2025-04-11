import dotenv from 'dotenv';
dotenv.config();

export const elasticsearchConfig = {
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  index: process.env.ELASTICSEARCH_INDEX || 'data-index',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || '',
    password: process.env.ELASTICSEARCH_PASSWORD || ''
  }
};
