export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppEnvironment {
  production: boolean;
  useFirebase: boolean;
  businessId: string;
  businessName: string;
  firebase: FirebaseConfig;
  firebaseSeedOnEmpty: boolean;
}
