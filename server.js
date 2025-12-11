const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

// Importar configuración de passport
require('./config/passport');

// Importar rutas
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const logRoutes = require('./routes/logs');

const app = express();

// Configuración para Vercel
const isProduction = process.env.NODE_ENV === 'production';

// Middleware de seguridad
app.use(helmet({
  contentSecurityPolicy: false, // Deshabilitar para desarrollo
  crossOriginEmbedderPolicy: false
}));

// Configuración CORS para producción separada
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (apps móviles, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // En desarrollo, permitir localhost
    if (!isProduction && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // En producción, permitir dominios específicos
    const allowedOrigins = [
      'https://eventual-frontend.vercel.app',
      'https://eventual.vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (isProduction && allowedOrigins.some(allowed => origin === allowed || origin.includes('vercel.app'))) {
      return callback(null, true);
    }
    
    // Más permisivo para desarrollo
    return callback(null, !isProduction);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isProduction ? 100 : 1000, // Más requests en desarrollo
  message: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde.'
});
app.use('/api', limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuración de sesión
app.use(session({
  secret: process.env.JWT_SECRET || 'fallback_secret_for_sessions',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // Solo HTTPS en producción
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Conectado a MongoDB');
})
.catch((error) => {
  console.error('❌ Error conectando a MongoDB:', error);
  if (!isProduction) {
    process.exit(1);
  }
});

// Manejo de errores de MongoDB
mongoose.connection.on('error', (error) => {
  console.error('❌ Error en la conexión MongoDB:', error);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB desconectado');
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/logs', logRoutes);

// Ruta de salud para verificar el servidor
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Servir archivos estáticos en producción
if (isProduction) {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('❌ Error no manejado:', error);
  
  res.status(error.status || 500).json({
    error: isProduction ? 'Error interno del servidor' : error.message,
    ...(isProduction ? {} : { stack: error.stack })
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;

// Para Vercel, exportar la app
if (process.env.NODE_ENV === 'production') {
  module.exports = app;
} else {
  // Para desarrollo local
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}