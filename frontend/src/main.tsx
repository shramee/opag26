import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './wagmi'
import App from './App'
import Landing from './Landing'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <WagmiProvider config={wagmiConfig}>
              <QueryClientProvider client={queryClient}>
                <App />
              </QueryClientProvider>
            </WagmiProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
