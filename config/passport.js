const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const jwt = require('jsonwebtoken');
const LoginLog = require('../models/LoginLog');

// Configuración de Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      picture: profile.photos[0].value,
      provider: 'google'
    };

    // Crear JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        name: user.name,
        provider: 'google'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Registrar login en el log
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
    const loginLog = new LoginLog({
      usuario: user.email,
      caducidad: expiryDate,
      token: token,
      provider: 'google',
      loginType: 'login'
    });

    await loginLog.save();

    user.token = token;
    return done(null, user);
  } catch (error) {
    console.error('Error en Google OAuth:', error);
    return done(error, null);
  }
}));

// Configuración de JWT Strategy para proteger rutas
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
}, async (jwtPayload, done) => {
  try {
    // Verificar que el token esté en el log y no haya expirado
    const logEntry = await LoginLog.findOne({
      usuario: jwtPayload.email,
      caducidad: { $gt: new Date() }
    });

    if (logEntry) {
      return done(null, jwtPayload);
    } else {
      return done(null, false);
    }
  } catch (error) {
    return done(error, false);
  }
}));

// Serialización de usuario para sesiones
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Middleware para verificar autenticación JWT
const requireAuth = passport.authenticate('jwt', { session: false });

// Middleware para verificar que el usuario es el organizador del evento
const requireEventOwnership = async (req, res, next) => {
  try {
    const Event = require('../models/Event');
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }
    
    if (event.organizador !== req.user.email) {
      return res.status(403).json({ 
        error: 'No tienes permisos para realizar esta acción. Solo el organizador puede modificar el evento.' 
      });
    }
    
    req.event = event; // Pasar el evento al siguiente middleware
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error verificando permisos' });
  }
};

module.exports = {
  requireAuth,
  requireEventOwnership
};