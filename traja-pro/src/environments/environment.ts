import { AppEnvironment } from './environment.types';

function isFirebaseConfigured(firebase: AppEnvironment['firebase']): boolean {
  return (
    !!firebase.apiKey &&
    firebase.apiKey !== 'YOUR_API_KEY' &&
    !!firebase.projectId &&
    firebase.projectId !== 'YOUR_PROJECT_ID'
  );
}

const firebase: AppEnvironment['firebase'] = {
  apiKey: 'AIzaSyA24NrQiRk7FpU_MwUJCRj77o0G_5rD-1k',
  authDomain: 'trajapro-926c2.firebaseapp.com',
  projectId: 'trajapro-926c2',
  storageBucket: 'trajapro-926c2.firebasestorage.app',
  messagingSenderId: '139965325584',
  appId: '1:139965325584:web:efc92f03f8775711f60595',
};

export const environment: AppEnvironment = {
  production: false,
  useFirebase: isFirebaseConfigured(firebase),
  businessId: 'studio-aurora',
  businessName: 'Studio Aurora',
  firebase,
  firebaseSeedOnEmpty: true,
};
