const express = require('express');
const axios = require('axios');
const multer = require('multer');
const Event = require('../models/Event');
const { requireAuth, requireEventOwnership } = require('../config/passport');
const { uploadImage, deleteImage } = require('../config/cloudinary');

const router = express.Router();

// Configuración de multer para manejo de archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Función para obtener coordenadas mediante geocoding
const getCoordinatesFromAddress = async (address) => {
  try {
    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
      throw new Error('API Key de geocoding no configurada');
    }

    const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json`, {
      params: {
        q: address,
        key: apiKey,
        limit: 1,
        language: 'es'
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      return {
        lat: result.geometry.lat,
        lon: result.geometry.lng,
        formatted: result.formatted
      };
    } else {
      throw new Error('No se pudieron obtener coordenadas para esta dirección');
    }
  } catch (error) {
    console.error('Error en geocoding:', error);
    throw error;
  }
};

// IMPORTANTE: Mover las rutas específicas ANTES de las rutas con parámetros

// GET /api/events/user/my-events - Obtener eventos del usuario autenticado
router.get('/user/my-events', requireAuth, async (req, res) => {
  try {
    console.log('Buscando eventos para usuario:', req.user.email); // Debug
    const events = await Event.find({ 
      organizador: req.user.email 
    }).sort({ timestamp: 1 });

    console.log('Eventos encontrados:', events.length); // Debug

    res.json({
      count: events.length,
      events: events
    });
  } catch (error) {
    console.error('Error obteniendo eventos del usuario:', error);
    res.status(500).json({ error: 'Error obteniendo eventos del usuario' });
  }
});

// POST /api/events/geocode - Endpoint para obtener coordenadas de una dirección
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'La dirección es requerida' });
    }

    const coordinates = await getCoordinatesFromAddress(address);
    res.json(coordinates);
  } catch (error) {
    console.error('Error en geocoding:', error);
    res.status(400).json({
      error: 'Error obteniendo coordenadas',
      details: error.message
    });
  }
});

// GET /api/events - Obtener todos los eventos o eventos cercanos
router.get('/', async (req, res) => {
  try {
    const { lat, lon, address } = req.query;
    let events;

    if (lat && lon) {
      // Buscar eventos cercanos usando coordenadas
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: 'Coordenadas inválidas' });
      }
      
      events = await Event.findNearby(latitude, longitude);
    } else if (address) {
      // Buscar eventos cercanos usando dirección
      try {
        const coords = await getCoordinatesFromAddress(address);
        events = await Event.findNearby(coords.lat, coords.lon);
      } catch (geocodingError) {
        return res.status(400).json({ 
          error: 'No se pudo procesar la dirección',
          details: geocodingError.message
        });
      }
    } else {
      // Obtener todos los eventos futuros
      events = await Event.find({ 
        timestamp: { $gte: new Date() }
      }).sort({ timestamp: 1 }).limit(100);
    }

    res.json({
      count: events.length,
      events: events
    });
  } catch (error) {
    console.error('Error obteniendo eventos:', error);
    res.status(500).json({ error: 'Error obteniendo eventos' });
  }
});

// GET /api/events/:id - Obtener un evento específico
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json(event);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de evento inválido' });
    }
    console.error('Error obteniendo evento:', error);
    res.status(500).json({ error: 'Error obteniendo evento' });
  }
});

// POST /api/events - Crear nuevo evento (requiere autenticación)
router.post('/', requireAuth, upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, timestamp, lugar, descripcion, categoria, precio, capacidad } = req.body;
    
    // Validaciones básicas
    if (!nombre || !timestamp || !lugar) {
      return res.status(400).json({ 
        error: 'Faltan campos obligatorios: nombre, timestamp y lugar son requeridos' 
      });
    }

    // Obtener coordenadas de la dirección
    let coordinates;
    try {
      coordinates = await getCoordinatesFromAddress(lugar);
    } catch (geocodingError) {
      return res.status(400).json({
        error: 'No se pudieron obtener las coordenadas de la dirección',
        details: geocodingError.message
      });
    }

    // Subir imagen si se proporcionó
    let imageUrl = null;
    if (req.file) {
      try {
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const uploadResult = await uploadImage(base64Image, 'eventos');
        
        if (uploadResult.success) {
          imageUrl = uploadResult.url;
        } else {
          console.warn('Error subiendo imagen:', uploadResult.error);
        }
      } catch (imageError) {
        console.warn('Error procesando imagen:', imageError);
        // Continuar sin imagen en caso de error
      }
    }

    // Crear nuevo evento
    const newEvent = new Event({
      nombre,
      timestamp: new Date(timestamp),
      lugar: coordinates.formatted || lugar,
      lat: coordinates.lat,
      lon: coordinates.lon,
      organizador: req.user.email,
      imagen: imageUrl,
      descripcion: descripcion || '',
      categoria: categoria || 'otro',
      precio: precio ? parseFloat(precio) : 0,
      capacidad: capacidad ? parseInt(capacidad) : null
    });

    const savedEvent = await newEvent.save();

    res.status(201).json({
      message: 'Evento creado exitosamente',
      event: savedEvent
    });
  } catch (error) {
    console.error('Error creando evento:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Error de validación',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ error: 'Error creando evento' });
  }
});

// PUT /api/events/:id - Actualizar evento (requiere autenticación y ser organizador)
router.put('/:id', requireAuth, requireEventOwnership, upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, timestamp, lugar, descripcion, categoria, precio, capacidad } = req.body;
    const event = req.event; // Del middleware requireEventOwnership

    // Actualizar campos básicos
    if (nombre) event.nombre = nombre;
    if (timestamp) event.timestamp = new Date(timestamp);
    if (descripcion !== undefined) event.descripcion = descripcion;
    if (categoria) event.categoria = categoria;
    if (precio !== undefined) event.precio = parseFloat(precio);
    if (capacidad !== undefined) event.capacidad = capacidad ? parseInt(capacidad) : null;

    // Si se cambió la dirección, obtener nuevas coordenadas
    if (lugar && lugar !== event.lugar) {
      try {
        const coordinates = await getCoordinatesFromAddress(lugar);
        event.lugar = coordinates.formatted || lugar;
        event.lat = coordinates.lat;
        event.lon = coordinates.lon;
      } catch (geocodingError) {
        return res.status(400).json({
          error: 'No se pudieron obtener las coordenadas de la nueva dirección',
          details: geocodingError.message
        });
      }
    }

    // Actualizar imagen si se proporcionó
    if (req.file) {
      try {
        // Eliminar imagen anterior si existe
        if (event.imagen) {
          // Extraer public_id de la URL de Cloudinary
          const publicId = event.imagen.split('/').pop().split('.')[0];
          await deleteImage(`eventos/${publicId}`);
        }

        // Subir nueva imagen
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const uploadResult = await uploadImage(base64Image, 'eventos');
        
        if (uploadResult.success) {
          event.imagen = uploadResult.url;
        }
      } catch (imageError) {
        console.warn('Error procesando nueva imagen:', imageError);
      }
    }

    const updatedEvent = await event.save();

    res.json({
      message: 'Evento actualizado exitosamente',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Error actualizando evento:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Error de validación',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ error: 'Error actualizando evento' });
  }
});

// DELETE /api/events/:id - Eliminar evento (requiere autenticación y ser organizador)
router.delete('/:id', requireAuth, requireEventOwnership, async (req, res) => {
  try {
    const event = req.event; // Del middleware requireEventOwnership

    // Eliminar imagen de Cloudinary si existe
    if (event.imagen) {
      try {
        const publicId = event.imagen.split('/').pop().split('.')[0];
        await deleteImage(`eventos/${publicId}`);
      } catch (imageError) {
        console.warn('Error eliminando imagen:', imageError);
      }
    }

    // Eliminar evento
    await Event.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Evento eliminado exitosamente',
      deletedEvent: {
        id: event._id,
        nombre: event.nombre
      }
    });
  } catch (error) {
    console.error('Error eliminando evento:', error);
    res.status(500).json({ error: 'Error eliminando evento' });
  }
});

module.exports = router;