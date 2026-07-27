const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const https = require('https');
const http = require('http');

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

const configureCloudinary = () => {
  if (!hasCloudinaryConfig()) return false;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  return true;
};

const logCloudinaryReportEvent = (event, details = {}) => {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null)
  );
  console.info(`[Cloudinary PDF] ${event}:`, safeDetails);
};

const uploadReportPdf = async (filePath, publicId) => {
  if (!configureCloudinary()) {
    const error = new Error('Cloudinary is not configured for persistent PDF storage.');
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }

  const uploadOptions = {
    resource_type: 'raw',
    type: 'upload',
    folder: 'marketing-report-generator/reports',
    public_id: publicId,
    overwrite: true,
    use_filename: false,
    unique_filename: false,
  };

  logCloudinaryReportEvent('upload_start', {
    resource_type: uploadOptions.resource_type,
    delivery_type: uploadOptions.type,
    public_id: `${uploadOptions.folder}/${publicId}`,
    format: 'pdf',
  });

  const result = await cloudinary.uploader.upload(filePath, uploadOptions);

  logCloudinaryReportEvent('upload_success', {
    resource_type: result.resource_type,
    delivery_type: result.type,
    public_id: result.public_id,
    format: result.format,
    secure_url: result.secure_url,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    deliveryType: result.type,
    format: result.format,
  };
};

const validateLocalPdf = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('Generated PDF file does not exist.');
  }

  const stats = fs.statSync(filePath);
  if (!stats.size) {
    throw new Error('Generated PDF file is empty.');
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const signature = Buffer.alloc(5);
    fs.readSync(fd, signature, 0, 5, 0);
    if (signature.toString('utf8') !== '%PDF-') {
      throw new Error('Generated file is not a valid PDF.');
    }
  } finally {
    fs.closeSync(fd);
  }

  return true;
};

const validateRemotePdfUrl = (url) =>
  new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(String(url || ''))) {
      return reject(new Error('Persistent PDF URL is not absolute.'));
    }

    const client = String(url).startsWith('https://') ? https : http;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const request = client.get(url, (response) => {
      const xCldError = response.headers['x-cld-error'];
      logCloudinaryReportEvent('delivery_check', {
        secure_url: url,
        http_status: response.statusCode,
        x_cld_error: xCldError,
        content_type: response.headers['content-type'],
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        const message =
          response.statusCode === 401
            ? "Cloudinary PDF delivery is disabled. Enable 'Allow delivery of PDF and ZIP files' in Cloudinary Security settings."
            : `Persistent PDF URL returned HTTP ${response.statusCode}.`;
        const error = new Error(message);
        error.code = response.statusCode === 401 ? 'CLOUDINARY_PDF_DELIVERY_DISABLED' : 'CLOUDINARY_DELIVERY_FAILED';
        error.httpStatus = response.statusCode;
        error.xCldError = xCldError;
        return finish(reject, error);
      }

      const chunks = [];
      let received = 0;

      response.on('data', (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        if (received >= 5) {
          const head = Buffer.concat(chunks).subarray(0, 5).toString('utf8');
          response.destroy();
          if (head !== '%PDF-') {
            return finish(reject, new Error('Persistent PDF URL did not return PDF bytes.'));
          }
          return finish(resolve, true);
        }
      });

      response.on('end', () => {
        const head = Buffer.concat(chunks).subarray(0, 5).toString('utf8');
        if (head !== '%PDF-') {
          return finish(reject, new Error('Persistent PDF URL did not return PDF bytes.'));
        }
        finish(resolve, true);
      });
    });

    request.setTimeout(15000, () => {
      finish(reject, new Error('Persistent PDF URL validation timed out.'));
      request.destroy();
    });

    request.on('error', (error) => {
      finish(reject, error);
    });
  });

module.exports = {
  hasCloudinaryConfig,
  uploadReportPdf,
  validateLocalPdf,
  validateRemotePdfUrl,
};
