import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/focus-rings.css'
import './index.css'
import App from './App.tsx'
import { AppAccessGate } from './access/AppAccessGate.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient.ts'
import { GoogleMapsProvider } from './components/GoogleMapsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppAccessGate>
        <AuthProvider>
          <GoogleMapsProvider>
            <App />
          </GoogleMapsProvider>
        </AuthProvider>
      </AppAccessGate>
    </QueryClientProvider>
  </StrictMode>,
)
