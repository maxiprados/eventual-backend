# Eventual Backend

API backend para la aplicación Eventual - Gestión de eventos.

## 🚀 Tecnologías

- **Node.js** - Runtime
- **Express.js** - Framework web
- **MongoDB/Mongoose** - Base de datos
- **Passport.js** - Autenticación OAuth
- **Cloudinary** - Almacenamiento de imágenes
- **OpenCage** - Geocoding de direcciones

## 🔧 Variables de entorno

Crear archivo `.env` basado en `.env.example`:

```bash
# Base de datos
MONGODB_URI=mongodb+srv://admin:admin@clusterdiciembre.09kb5yo.mongodb.net/eventual

# JWT
JWT_SECRET=tu_jwt_secret_super_seguro

# Google OAuth
GOOGLE_CLIENT_ID=tu_google_client_id
GOOGLE_CLIENT_SECRET=tu_google_client_secret
FRONTEND_URL=https://eventual-frontend.vercel.app

# Cloudinary
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

# OpenCage
OPENCAGE_API_KEY=tu_opencage_key

# Servidor
PORT=5000
NODE_ENV=production
```

## 📦 Instalación y desarrollo

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Servidor de producción
npm start
```

## 🌐 Despliegue en Render

1. Crear nuevo Web Service en Render
2. Conectar este repositorio
3. Configurar variables de entorno
4. Build Command: `npm install`
5. Start Command: `npm start`

## 🔗 Frontend

El frontend se encuentra en: https://github.com/maxiprados/eventual-frontend