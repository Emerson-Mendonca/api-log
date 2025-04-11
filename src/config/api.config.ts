import dotenv from 'dotenv';
dotenv.config();

export const apiConfig = {
  port: process.env.API_PORT || 3000,
  host: process.env.API_HOST || 'localhost',
  basePath: '/api/v1'
};

// src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};