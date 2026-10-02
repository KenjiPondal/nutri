import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    return 'dev_only_insecure_secret';
  }
  return secret;
};

// HS256 pinned so a token can't pick its own algorithm.
const OPTS = { algorithm: 'HS256', expiresIn: '7d' };

export const signToken = (userId) => jwt.sign({ id: String(userId) }, getSecret(), OPTS);

/**
 * Verify with the current secret; during a rotation also accept JWT_SECRET_PREVIOUS
 * so people aren't logged out the moment the secret changes (old tokens expire within 7 days).
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  } catch (e) {
    const prev = process.env.JWT_SECRET_PREVIOUS;
    if (prev && e.name === 'JsonWebTokenError') return jwt.verify(token, prev, { algorithms: ['HS256'] });
    throw e;
  }
};
