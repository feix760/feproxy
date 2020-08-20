
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const mkdirp = require('mkdirp');

function getRootCA(name, dir) {
  const keyFile = path.join(dir, `${name}.key`);
  const certFile = path.join(dir, `${name}.crt`);

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    const pem = {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };
    return {
      key: forge.pki.privateKeyFromPem(pem.key),
      cert: forge.pki.certificateFromPem(pem.cert),
      pem,
    };
  }
  const rootCA = createRootCA(name);

  mkdirp.sync(path.dirname(keyFile));
  fs.writeFileSync(keyFile, rootCA.pem.key);
  fs.writeFileSync(certFile, rootCA.pem.cert);

  return rootCA;
}

function createRootCA(name) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  setCertValidity(cert);

  const attrs = [
    {
      name: 'commonName',
      value: name,
    },
    {
      name: 'countryName',
      value: 'CN',
    },
    {
      shortName: 'ST',
      value: 'GD',
    },
    {
      name: 'localityName',
      value: 'GZ',
    },
    {
      name: 'organizationName',
      value: `${new Date().toISOString().slice(0, 10)}.feproxy.org`,
    },
    {
      shortName: 'OU',
      value: 'feproxy.org',
    },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    { name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true,
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: keys.privateKey,
    cert,
    pem: {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
  };
}

function setCertValidity(cert) {
  const curYear = new Date().getFullYear();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notBefore.setFullYear(curYear - 1);
  cert.validity.notAfter.setFullYear(curYear + 1);
}

function createCertificate(rootCA, hostname) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(rootCA.key.n, rootCA.key.e);
  cert.serialNumber = crypto.createHash('sha1')
    .update(hostname, 'binary')
    .digest('hex');
  setCertValidity(cert);

  cert.setSubject([
    {
      name: 'commonName',
      value: hostname,
    },
  ]);

  cert.setIssuer(rootCA.cert.subject.attributes);
  cert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2,
          value: hostname,
        },
      ],
    },
  ]);

  cert.sign(rootCA.key, forge.md.sha256.create());

  return {
    key: rootCA.key,
    cert,
    pem: {
      key: forge.pki.privateKeyToPem(rootCA.key),
      cert: forge.pki.certificateToPem(cert),
    },
  };
}

exports.getRootCA = getRootCA;
exports.createCertificate = createCertificate;
