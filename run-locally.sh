#!/bin/bash

# Script para iniciar a aplicação usando Docker Compose

# Verificar se o Docker está instalado
if ! command -v docker &> /dev/null
then
    echo "Docker não está instalado. Por favor instale o Docker primeiro."
    exit 1
fi

# Verificar se o Docker Compose está instalado
if ! command -v docker-compose &> /dev/null
then
    echo "Docker Compose não está instalado. Por favor instale o Docker Compose primeiro."
    exit 1
fi

# Construir e iniciar os contêineres
echo "Construindo e iniciando os contêineres..."
docker-compose up -d --build

# Verificar se os contêineres estão rodando
echo "Verificando status dos contêineres..."
docker-compose ps

# Esperar até que o Elasticsearch esteja pronto
echo "Aguardando o Elasticsearch iniciar..."
until $(curl --output /dev/null --silent --head --fail http://localhost:9200); do
    printf '.'
    sleep 5
done
echo "Elasticsearch está pronto!"

# Esperar até que o RabbitMQ esteja pronto
echo "Aguardando o RabbitMQ iniciar..."
until $(curl --output /dev/null --silent --head --fail http://localhost:15672); do
    printf '.'
    sleep 5
done
echo "RabbitMQ está pronto!"

# Esperar até que o Kibana esteja pronto
echo "Aguardando o Kibana iniciar..."
until $(curl --output /dev/null --silent --head --fail http://localhost:5601); do
    printf '.'
    sleep 10  # Kibana pode demorar mais para inicializar
done
echo "Kibana está pronto!"

# Mensagem final atualizada
echo "Serviços iniciados com sucesso!"
echo "API: http://localhost:3000/api/v1/health"
echo "RabbitMQ Management: http://localhost:15672 (guest/guest)"
echo "Elasticsearch: http://localhost:9200"
echo "Kibana: http://localhost:5601"

# Para ver os logs da aplicação
echo "Para ver os logs da aplicação, execute: docker-compose logs -f app"