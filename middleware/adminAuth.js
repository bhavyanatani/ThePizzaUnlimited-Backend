import 'dotenv/config';
import jwt from 'jsonwebtoken';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
export const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

export function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) return res.status(401).json({ success: false, message: 'Missing token.' });
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.sub !== ADMIN_EMAIL || payload?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    req.admin = { email: ADMIN_EMAIL };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}


