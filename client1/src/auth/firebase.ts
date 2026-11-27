import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { config } from '../config';

export const firebaseConfigured = Object.values(config.firebase).every((value) => !!value);
export const firebaseAuth = firebaseConfigured
  ? getAuth(getApps().length ? getApp() : initializeApp(config.firebase))
  : null;
