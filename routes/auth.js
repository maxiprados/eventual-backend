const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const LoginLog = require('../models/LoginLog');

const router = express.Router();

// Ruta para iniciar OAuth con Google
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// Callback de Google OAuth
router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      if (req.user && req.user.token) {
        // Redirigir al frontend con el token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth/success?token=${req.user.token}&user=${encodeURIComponent(JSON.stringify({
          email: req.user.email,
          name: req.user.name,
          picture: req.user.picture
        }))}`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`);
      }
    } catch (error) {
      console.error('Error en callback de Google:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`);
    }
  }
);

// Verificar token JWT
router.get('/verify', 
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({
      valid: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        provider: req.user.provider
      }
    });
  }
);

// Renovar token
router.post('/refresh',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      // Crear nuevo token
      const newToken = jwt.sign(
        { 
          id: req.user.id, 
          email: req.user.email,
          name: req.user.name,
          provider: req.user.provider
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Registrar refresh en el log
      const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const refreshLog = new LoginLog({
        usuario: req.user.email,
        caducidad: expiryDate,
        token: newToken,
        provider: req.user.provider,
        loginType: 'refresh',
        userAgent: req.get('User-Agent') || '',
        ipAddress: req.ip || req.connection.remoteAddress || ''
      });

      await refreshLog.save();

      res.json({
        token: newToken,
        expiresIn: '24h'
      });
    } catch (error) {
      console.error('Error renovando token:', error);
      res.status(500).json({ error: 'Error renovando token' });
    }
  }
);

// Logout
router.post('/logout',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      // Registrar logout en el log
      const logoutLog = new LoginLog({
        usuario: req.user.email,
        caducidad: new Date(), // Fecha pasada para indicar token inválido
        token: req.get('Authorization')?.replace('Bearer ', '') || '',
        provider: req.user.provider,
        loginType: 'logout',
        userAgent: req.get('User-Agent') || '',
        ipAddress: req.ip || req.connection.remoteAddress || ''
      });

      await logoutLog.save();

      res.json({ 
        message: 'Logout exitoso',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({ error: 'Error en logout' });
    }
  }
);

// Obtener perfil del usuario actual
router.get('/profile',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      // Obtener últimos logins del usuario
      const recentLogins = await LoginLog.getUserLogs(req.user.email, 5);
      
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          provider: req.user.provider
        },
        recentLogins: recentLogins
      });
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      res.status(500).json({ error: 'Error obteniendo perfil' });
    }
  }
);

// Endpoint de prueba para verificar configuración OAuth
router.get('/config', (req, res) => {
  res.json({
    googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    jwtConfigured: !!process.env.JWT_SECRET,
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;