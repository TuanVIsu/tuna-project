// middlewares/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tuna_secret_key';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Chưa đăng nhập' });

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ' });
    req.user = decodedUser;
    next();
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Chỉ Super Admin mới có quyền thực hiện thao tác này!' });
  }
  next();
};

module.exports = { authenticateToken, requireSuperAdmin, JWT_SECRET };