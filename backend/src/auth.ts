import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, type Role } from './env.js';

export function signToken(role: Role, extra: Record<string, unknown> = {}, expiresIn: '12h' | '30d' = '12h') {
  return jwt.sign({ role, ...extra }, env.JWT_SECRET, { expiresIn, algorithm: 'HS256' });
}

export interface Authed extends Request {
  role?: Role;
  email?: string;
}

export function auth(required: Role[]) {
  return (req: Authed, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return next(Object.assign(new Error('Missing token'), { status: 401 }));
    try {
      const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { role: Role; email?: string };
      if (!required.includes(p.role)) return next(Object.assign(new Error('Forbidden'), { status: 403 }));
      req.role = p.role;
      req.email = p.email;
      next();
    } catch {
      next(Object.assign(new Error('Invalid token'), { status: 401 }));
    }
  };
}
