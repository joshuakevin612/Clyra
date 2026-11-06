import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ExperienceProvider } from './experience/Experience';
import { mockMode } from './api/client';
import './styles.css';
import './motion.css';
import './experience/experience.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './experience/cinema.css';
import './experience/flow.css';
import './experience/aurum.css';
async function start(){
 if(mockMode){const {worker}=await import('./mocks/browser');await worker.start({onUnhandledRequest:'bypass'});}
 ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ExperienceProvider><App/></ExperienceProvider></React.StrictMode>);
}
start().catch(()=>{document.getElementById('root')!.textContent='Clyra could not start. Reload to try again.';});
