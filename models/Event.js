const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del evento es obligatorio'],
    trim: true,
    maxLength: [200, 'El nombre no puede superar los 200 caracteres']
  },
  timestamp: {
    type: Date,
    required: [true, 'La fecha y hora del evento es obligatoria'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'La fecha del evento debe ser futura'
    }
  },
  lugar: {
    type: String,
    required: [true, 'La dirección del evento es obligatoria'],
    trim: true,
    maxLength: [500, 'La dirección no puede superar los 500 caracteres']
  },
  lat: {
    type: Number,
    required: [true, 'La latitud es obligatoria'],
    min: [-90, 'La latitud debe estar entre -90 y 90'],
    max: [90, 'La latitud debe estar entre -90 y 90']
  },
  lon: {
    type: Number,
    required: [true, 'La longitud es obligatoria'],
    min: [-180, 'La longitud debe estar entre -180 y 180'],
    max: [180, 'La longitud debe estar entre -180 y 180']
  },
  organizador: {
    type: String,
    required: [true, 'El email del organizador es obligatorio'],
    lowercase: true,
    validate: {
      validator: function(email) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: 'Email inválido'
    }
  },
  imagen: {
    type: String,
    default: null,
    validate: {
      validator: function(url) {
        if (!url) return true; // Permitir null/undefined
        return /^https?:\/\//.test(url);
      },
      message: 'La imagen debe ser una URL válida'
    }
  },
  descripcion: {
    type: String,
    maxLength: [2000, 'La descripción no puede superar los 2000 caracteres'],
    default: ''
  },
  categoria: {
    type: String,
    enum: ['cultural', 'deportivo', 'musical', 'educativo', 'gastronómico', 'tecnológico', 'otro'],
    default: 'otro'
  },
  precio: {
    type: Number,
    min: [0, 'El precio no puede ser negativo'],
    default: 0
  },
  capacidad: {
    type: Number,
    min: [1, 'La capacidad debe ser al menos 1'],
    default: null
  }
}, {
  timestamps: true, // Añade createdAt y updatedAt automáticamente
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Índices para optimizar las consultas
eventSchema.index({ lat: 1, lon: 1 }); // Para búsquedas geoespaciales
eventSchema.index({ timestamp: 1 }); // Para ordenación por fecha
eventSchema.index({ organizador: 1 }); // Para búsquedas por organizador
eventSchema.index({ categoria: 1 }); // Para filtros por categoría

// Método estático para buscar eventos cercanos
eventSchema.statics.findNearby = function(lat, lon, maxDistance = 0.2) {
  return this.find({
    lat: { 
      $gte: lat - maxDistance, 
      $lte: lat + maxDistance 
    },
    lon: { 
      $gte: lon - maxDistance, 
      $lte: lon + maxDistance 
    },
    timestamp: { $gte: new Date() } // Solo eventos futuros
  }).sort({ timestamp: 1 });
};

// Método para calcular la distancia entre dos puntos (fórmula de Haversine simplificada)
eventSchema.statics.calculateDistance = function(lat1, lon1, lat2, lon2) {
  const deltaLat = Math.abs(lat1 - lat2);
  const deltaLon = Math.abs(lon1 - lon2);
  return Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
};

// Middleware pre-save para validaciones adicionales
eventSchema.pre('save', function(next) {
  // Asegurar que la fecha no sea pasada al crear
  if (this.isNew && this.timestamp <= new Date()) {
    next(new Error('No se pueden crear eventos con fecha pasada'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Event', eventSchema);