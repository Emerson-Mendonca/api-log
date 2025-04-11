export interface Message {
  id: string;
  content: any;
  timestamp: number;
  [key: string]: any;
}