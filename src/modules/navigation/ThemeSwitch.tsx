'use client';
import {useEffect,useState} from 'react';
type Theme='system'|'light'|'dark';
export function ThemeSwitch({locale}:{locale:'fr'|'ar'}){const [theme,setTheme]=useState<Theme>('system');
 useEffect(()=>{try{const saved=localStorage.getItem('tndocs-theme');if(saved==='light'||saved==='dark')setTheme(saved);}catch{}},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('tndocs-theme',theme)}catch{}},[theme]);
 return <label>{locale==='ar'?'المظهر':'Thème'} <select aria-label={locale==='ar'?'المظهر':'Thème'} value={theme} onChange={e=>setTheme(e.target.value as Theme)}><option value="system">{locale==='ar'?'النظام':'Système'}</option><option value="light">{locale==='ar'?'فاتح':'Clair'}</option><option value="dark">{locale==='ar'?'داكن':'Sombre'}</option></select></label>;
}
