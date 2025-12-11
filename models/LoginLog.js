const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  usuario: {
    type: String,
    required: [true, 'El email del usuario es obligatorio'],
    lowercase: true,
    validate: {
      validator: function(email) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: 'Email inválido'
    }
  },
  caducidad: {
    type: Date,
    required: [true, 'La fecha de caducidad del token es obligatoria'],
    validate: {
      validator: function(value) {
        return value > this.timestamp;
      },
      message: 'La fecha de caducidad debe ser posterior al login'
    }
  },
  token: {
    type: String,
    required: [true, 'El token de identificación es obligatorio']
  },
  provider: {
    type: String,
    enum: ['google', 'facebook', 'local'],
    default: 'google',
    required: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  loginType: {
    type: String,
    enum: ['login', 'refresh', 'logout'],
    default: 'login'
  }
}, {
  timestamps: false, // No necesitamos createdAt/updatedAt adicionales
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      // Por seguridad, no exponer el token completo en las respuestas
      if (ret.token) {
        ret.tokenPreview = ret.token.substring(0, 10) + '...';
        delete ret.token;
      }
      return ret;
    }
  }
});

// Índices para optimizar consultas
loginLogSchema.index({ timestamp: -1 }); // Para ordenación descendente por fecha
loginLogSchema.index({ usuario: 1 }); // Para búsquedas por usuario
loginLogSchema.index({ caducidad: 1 }); // Para limpiar tokens expirados

// Método estático para obtener logs recientes
loginLogSchema.statics.getRecentLogs = function(limit = 100) {
  return this.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-token'); // No incluir tokens por seguridad
};

// Método estático para obtener logs de un usuario específico
loginLogSchema.statics.getUserLogs = function(email, limit = 50) {
  return this.find({ usuario: email })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-token');
};

// Método estático para limpiar tokens expirados (para ejecutar periódicamente)
loginLogSchema.statics.cleanExpiredTokens = function() {
  return this.deleteMany({
    caducidad: { $lt: new Date() }
  });
};

// Método para verificar si un token está activo
loginLogSchema.statics.isTokenValid = function(token) {
  return this.findOne({
    token: token,
    caducidad: { $gt: new Date() }
  });
};

// Middleware pre-save para validaciones adicionales
loginLogSchema.pre('save', function(next) {
  // Asegurar que la fecha de caducidad sea razonable (máximo 30 días)
  const maxExpiryDate = new Date(this.timestamp.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (this.caducidad > maxExpiryDate) {
    this.caducidad = maxExpiryDate;
  }
  next();
});

module.exports = mongoose.model('LoginLog', loginLogSchema);