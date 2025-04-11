// src/types/amqplib.d.ts

declare module 'amqplib' {
  export interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
    on(event: string, listener: Function): this;
    serverProperties: any;
    expectSocketClose: any;
    sentSinceLastCheck: any;
    recvSinceLastCheck: any;
    sendMessagets: any;
  }

  export interface Channel {
    assertQueue(queue: string, options?: any): Promise<any>;
    prefetch(count: number): Promise<void>;
    consume(queue: string, onMessage: (msg: ConsumeMessage | null) => void, options?: any): Promise<any>;
    ack(message: ConsumeMessage, allUpTo?: boolean): void;
    nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
    sendToQueue(queue: string, content: Buffer, options?: any): boolean;
    close(): Promise<void>;
  }

  export interface ConsumeMessage {
    content: Buffer;
    fields: any;
    properties: any;
  }

  export function connect(url: string | any): Promise<Connection>;
}