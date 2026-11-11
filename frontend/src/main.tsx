import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/global.scss'
import App from './App.tsx'

// 서버에서 받은 방 정보를 캐시하는 저장소입니다.
// 컴포넌트 밖에서 한 번 생성해야 화면이 다시 그려져도 캐시가 유지됩니다.
const queryClient = new QueryClient()

// index.html의 #root에 React 앱을 연결합니다.
// StrictMode는 개발 중 잘못된 부수 효과를 찾도록 돕고,
// QueryClientProvider는 하위 컴포넌트에서 useQuery/useMutation을 사용하게 합니다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
