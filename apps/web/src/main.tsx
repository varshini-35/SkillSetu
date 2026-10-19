import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';

function renderApp(){
  const root=document.getElementById('root');
  if(!root)throw new Error('SkillSetu root element was not found');
  createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
}

async function startApp(){
  if((import.meta as any).env?.DEV&&'serviceWorker'in navigator){
    try{
      const scriptUrl=new URL('/sw.js',window.location.origin).href;
      const registrations=await navigator.serviceWorker.getRegistrations();
      const appRegistrations=registrations.filter(registration=>
        [registration.active,registration.waiting,registration.installing]
          .some(worker=>worker?.scriptURL===scriptUrl),
      );
      const controlledByAppWorker=navigator.serviceWorker.controller?.scriptURL===scriptUrl;
      if(appRegistrations.length){
        await Promise.all(appRegistrations.map(registration=>registration.unregister()));
        if(controlledByAppWorker){window.location.reload();return;}
      }
    }catch(error){
      console.warn('Could not remove the previous SkillSetu service worker in development.',error);
    }
  }
  renderApp();
}

void startApp();
