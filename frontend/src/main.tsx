import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { mockMode } from './api/client';
import './styles.css';
async function start(){
 if(mockMode){const {worker}=await import('./mocks/browser');await worker.start({onUnhandledRequest:'bypass'});}
 ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
}
start().catch(()=>{document.getElementById('root')!.textContent='Clyra could not start. Reload to try again.';});
