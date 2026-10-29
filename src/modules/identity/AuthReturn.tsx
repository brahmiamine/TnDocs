'use client';
import {useEffect} from 'react';import {usePathname} from 'next/navigation';import {safePostAuthPath} from './return-path';
export function AuthReturn({locale}:{locale:'fr'|'ar'}){const pathname=usePathname();useEffect(()=>{if(pathname!==`/${locale}/mes-documents`)return;try{const destination=safePostAuthPath(sessionStorage.getItem('tndocs-auth-return'),locale);sessionStorage.removeItem('tndocs-auth-return');if(destination)window.location.replace(destination);}catch{}},[pathname,locale]);return null;}
