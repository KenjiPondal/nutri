import { verifyToken } from '../utils/jwt.js';

export const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No auth token' });
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid' });
  }
};
