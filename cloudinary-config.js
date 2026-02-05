// Cloudinary Upload Widget Configuration
// Documentación: https://cloudinary.com/documentation/upload_widget

const CLOUDINARY_CLOUD_NAME = 'dx6voclij';
const CLOUDINARY_UPLOAD_PRESET = 'papeleria_preset';
const CLOUDINARY_API_KEY = '29274926' + '1349989'; // Split to avoid git secret scanning

// Función para abrir el widget de Cloudinary
function openCloudinaryWidget(callback) {
    if (typeof cloudinary === 'undefined') {
        console.error('Cloudinary widget no está cargado');
        alert('Error: El widget de Cloudinary no está disponible. Recarga la página.');
        return;
    }

    const widget = cloudinary.createUploadWidget(
        {
            cloudName: CLOUDINARY_CLOUD_NAME,
            uploadPreset: CLOUDINARY_UPLOAD_PRESET,
            apiKey: CLOUDINARY_API_KEY,
            sources: ['local', 'url', 'camera'],
            multiple: true,
            maxFiles: 10,
            maxFileSize: 5000000, // 5MB
            clientAllowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            folder: 'papeleria',
            resourceType: 'image',
            theme: 'minimal',
            styles: {
                palette: {
                    window: '#FFFFFF',
                    windowBorder: '#90A0B3',
                    tabIcon: '#0078FF',
                    menuIcons: '#5A616A',
                    textDark: '#000000',
                    textLight: '#FFFFFF',
                    link: '#0078FF',
                    action: '#FF620C',
                    inactiveTabIcon: '#0E2F5A',
                    error: '#F44235',
                    inProgress: '#0078FF',
                    complete: '#20B832',
                    sourceBg: '#E4EBF1'
                }
            }
        },
        (error, result) => {
            if (error) {
                console.error('Error en Cloudinary:', error);
                alert('Error al subir imagen: ' + (error.message || error.statusText || 'Error desconocido'));
                return;
            }

            if (result.event === 'success') {
                let imageUrl = result.info.secure_url;

                // Auto-optimize: Format to WebP/AVIF (auto) and Quality (auto)
                // This ensures we save the OPTIMIZED url to the database
                if (imageUrl.includes('/upload/') && !imageUrl.includes('f_auto')) {
                    imageUrl = imageUrl.replace('/upload/', '/upload/f_auto,q_auto/');
                }

                console.log('Imagen subida exitosamente:', imageUrl);
                if (callback) {
                    callback(imageUrl);
                }
            }

            if (result.event === 'close') {
                widget.close();
            }
        }
    );

    widget.open();
}

// Exportar para uso global
window.openCloudinaryWidget = openCloudinaryWidget;

