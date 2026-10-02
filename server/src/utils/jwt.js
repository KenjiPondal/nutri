import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    return 'dev_only_insecure_secret';
  }
  return secret;
};

export const signToken = (userId) => jwt.sign({ id: userId }, getSecret(), { expiresIn: '7d' });
export const verifyToken = (token) => jwt.verify(token, getSecret());
