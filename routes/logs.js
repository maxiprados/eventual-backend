const express = require('express');
const LoginLog = require('../models/LoginLog');
const { requireAuth } = require('../config/passport');

const router = express.Router();

// GET /api/logs - Obtener todos los logs de login (ordenados por fecha descendente)
router.get('/', async (req, res) => {
  try {
    const { limit = 100, page = 1, user } = req.query;
    
    const pageLimit = Math.min(parseInt(limit), 1000); // Máximo 1000 registros por página
    const skip = (parseInt(page) - 1) * pageLimit;
    
    let query = {};
    
    // Filtrar por usuario si se especifica
    if (user) {
      query.usuario = user.toLowerCase();
    }
    
    // Obtener logs con paginación
    const logs = await LoginLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageLimit)
      .select('-token'); // No incluir tokens por seguridad
    
    // Contar total de logs para paginación
    const total = await LoginLog.countDocuments(query);
    
    res.json({
      logs: logs,
      pagination: {
        total: total,
        page: parseInt(page),
        limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
        hasNext: skip + pageLimit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({ error: 'Error obteniendo logs de login' });
  }
});

// GET /api/logs/recent - Obtener logs recientes (últimos 50 por defecto)
router.get('/recent', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const logs = await LoginLog.getRecentLogs(Math.min(parseInt(limit), 500));
    
    res.json({
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error obteniendo logs recientes:', error);
    res.status(500).json({ error: 'Error obteniendo logs recientes' });
  }
});

// GET /api/logs/user/:email - Obtener logs de un usuario específico
router.get('/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 50 } = req.query;
    
    const logs = await LoginLog.getUserLogs(email.toLowerCase(), Math.min(parseInt(limit), 200));
    
    res.json({
      user: email,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error obteniendo logs del usuario:', error);
    res.status(500).json({ error: 'Error obteniendo logs del usuario' });
  }
});

// GET /api/logs/my-logs - Obtener logs del usuario autenticado
router.get('/my-logs', requireAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const logs = await LoginLog.getUserLogs(req.user.email, Math.min(parseInt(limit), 200));
    
    res.json({
      user: req.user.email,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error obteniendo logs del usuario autenticado:', error);
    res.status(500).json({ error: 'Error obteniendo tus logs' });
  }
});

// GET /api/logs/stats - Obtener estadísticas de los logs
router.get('/stats', async (req, res) => {
  try {
    // Total de logs
    const totalLogs = await LoginLog.countDocuments();
    
    // Logs por tipo
    const logsByType = await LoginLog.aggregate([
      {
        $group: {
          _id: '$loginType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Logs por proveedor
    const logsByProvider = await LoginLog.aggregate([
      {
        $group: {
          _id: '$provider',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Usuarios únicos
    const uniqueUsers = await LoginLog.distinct('usuario').then(users => users.length);
    
    // Logs de la última semana
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logsLastWeek = await LoginLog.countDocuments({
      timestamp: { $gte: oneWeekAgo }
    });
    
    // Logs por día de la última semana
    const logsByDay = await LoginLog.aggregate([
      {
        $match: {
          timestamp: { $gte: oneWeekAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
    
    res.json({
      total: totalLogs,
      uniqueUsers: uniqueUsers,
      logsLastWeek: logsLastWeek,
      breakdown: {
        byType: logsByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byProvider: logsByProvider.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byDay: logsByDay.map(item => ({
          date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
          count: item.count
        }))
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// DELETE /api/logs/cleanup - Limpiar tokens expirados (solo para administradores o uso interno)
router.delete('/cleanup', async (req, res) => {
  try {
    // En un entorno de producción, esta ruta debería tener autenticación de admin
    const result = await LoginLog.cleanExpiredTokens();
    
    res.json({
      message: 'Limpieza completada',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error en limpieza:', error);
    res.status(500).json({ error: 'Error en limpieza de tokens expirados' });
  }
});

// POST /api/logs/search - Búsqueda avanzada de logs
router.post('/search', async (req, res) => {
  try {
    const { 
      usuario, 
      provider, 
      loginType, 
      startDate, 
      endDate, 
      limit = 100 
    } = req.body;
    
    let query = {};
    
    // Filtros opcionales
    if (usuario) {
      query.usuario = { $regex: usuario, $options: 'i' };
    }
    
    if (provider) {
      query.provider = provider;
    }
    
    if (loginType) {
      query.loginType = loginType;
    }
    
    // Filtro por rango de fechas
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    const logs = await LoginLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit), 1000))
      .select('-token');
    
    res.json({
      query: req.body,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error en búsqueda de logs:', error);
    res.status(500).json({ error: 'Error en búsqueda de logs' });
  }
});

module.exports = router;