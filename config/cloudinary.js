const cloudinary = require('cloudinary').v2;

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube una imagen a Cloudinary
 * @param {string} imageData - Datos de la imagen en base64 o buffer
 * @param {string} folder - Carpeta en Cloudinary (opcional)
 * @returns {Promise<Object>} - Resultado de la subida
 */
const uploadImage = async (imageData, folder = 'eventos') => {
  try {
    const result = await cloudinary.uploader.upload(imageData, {
      folder: folder,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 600, crop: 'limit' }, // Limitar tamaño
        { quality: 'auto:good' }, // Optimizar calidad
        { format: 'webp' } // Convertir a WebP para mejor compresión
      ]
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes
    };
  } catch (error) {
    console.error('Error subiendo imagen a Cloudinary:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Elimina una imagen de Cloudinary
 * @param {string} publicId - ID público de la imagen en Cloudinary
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Error eliminando imagen de Cloudinary:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Genera una URL de imagen con transformaciones
 * @param {string} publicId - ID público de la imagen
 * @param {Object} options - Opciones de transformación
 * @returns {string} - URL transformada
 */
const getTransformedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 400,
    height: 300,
    crop: 'fill',
    quality: 'auto:good',
    format: 'webp'
  };

  const transformOptions = { ...defaultOptions, ...options };
  
  return cloudinary.url(publicId, transformOptions);
};

/**
 * Obtiene información de una imagen
 * @param {string} publicId - ID público de la imagen
 * @returns {Promise<Object>} - Información de la imagen
 */
const getImageInfo = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      success: true,
      info: {
        publicId: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        created: result.created_at
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  cloudinary,
  uploadImage,
  deleteImage,
  getTransformedUrl,
  getImageInfo
};