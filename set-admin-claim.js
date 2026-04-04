const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = 'g9iOo1VgVVNoihlyuHWyRR3sZq43'; // Use the UID from the screenshot

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log('Custom claim set successfully for UID:', uid);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error setting custom claim:', error);
    process.exit(1);
  });
