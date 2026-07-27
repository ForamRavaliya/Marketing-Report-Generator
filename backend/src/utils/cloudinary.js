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

const uploadReportPdf = async (filePath, publicId) => {
  if (!configureCloudinary()) {
    const error = new Error('Cloudinary is not configured for persistent PDF storage.');
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    folder: 'marketing-report-generator/reports',
    public_id: publicId,
    overwrite: true,
    use_filename: false,
    unique_filename: false,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
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
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        return finish(reject, new Error(`Persistent PDF URL returned HTTP ${response.statusCode}.`));
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
