export interface Message {
  id: string;
  content: any;
  timestamp: number;
  updateTimestamp: number;
  [key: string]: any;
}