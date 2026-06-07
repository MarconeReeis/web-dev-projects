import { AppEnvironment } from './environment.types';

/**
 * Copie os valores para environment.ts com as credenciais do Firebase Console
 */
export const environmentExample: AppEnvironment = {
  production: false,
  useFirebase: true,
  businessId: 'studio-aurora',
  businessName: 'Studio Aurora',
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'seu-projeto.firebaseapp.com',
    projectId: 'seu-projeto',
    storageBucket: 'seu-projeto.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abc123',
  },
  firebaseSeedOnEmpty: true,
};
