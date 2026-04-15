import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  id: number;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

export const createAuthToken = (user: AuthUser): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const expiresIn = (process.env.JWT_EXPIRES_IN || '12h') as jwt.SignOptions['expiresIn'];
  return jwt.sign(user, jwtSecret, { expiresIn });
};

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT secret not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as AuthUser;
    req.user = {
      id: Number(payload.id),
      email: String(payload.email),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
