// 비어 있으면 로컬 Vite 프록시 또는 같은 출처의 백엔드를 사용합니다.
export const backendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN ?? '').trim().replace(/\/+$/, '')
